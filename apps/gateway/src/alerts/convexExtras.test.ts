// Proposed D-57: briefing audio in Convex file storage (CONVEX_AUDIO_STORAGE) and the per-number
// outbound call limit (CONVEX_CALL_RATE_LIMIT). Fakes stand in for Convex; convex/audio.ts and
// convex/limits.ts themselves are covered in store/convexExtras.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { ConvexStore } from "../store/convex.js";
import type { Store } from "../store/types.js";
import { ALLOWED, NOT_ALLOWED, auth, testGateway, until, type TestGateway } from "../testkit.js";
import type { BriefingAudioStore, CallLimiter } from "./convexExtras.js";

let gw: TestGateway | null = null;
afterEach(async () => {
  await gw?.app.close();
  gw = null;
});

class FakeAudioStore implements BriefingAudioStore {
  files = new Map<string, Buffer>();
  loads = 0;
  failLoad = false;
  async saveBriefingAudio(alertId: string, audio: Buffer): Promise<void> {
    this.files.set(alertId, Buffer.from(audio));
  }
  async loadBriefingAudio(alertId: string): Promise<Buffer | null> {
    this.loads++;
    if (this.failLoad) throw new Error("convex down");
    return this.files.get(alertId) ?? null;
  }
}

/** Fixed window like convex/limits.ts: `rate` calls per number. */
class FakeLimiter implements CallLimiter {
  taken: string[] = [];
  fail = false;
  constructor(private readonly rate = 3) {}
  async takeAlertCall(phone: string) {
    if (this.fail) throw new Error("convex down");
    if (this.taken.filter((p) => p === phone).length >= this.rate) return { ok: false as const, retryAfterMs: 420_000 };
    this.taken.push(phone);
    return { ok: true as const };
  }
}

type Extras = { audioStore?: BriefingAudioStore | null; callLimiter?: CallLimiter | null };
const deps = (g: TestGateway) => (g.alerts as unknown as { deps: Extras }).deps;

function withExtras(opts: { store?: Store; env?: Record<string, string>; telephonySpeed?: number }, extras: Extras): TestGateway {
  const g = testGateway(opts);
  Object.assign(deps(g), extras);
  return g;
}

async function likelyCall(g: TestGateway) {
  const call = g.calls.create({ mode: "phone", label: "dev", streamStartedNow: true });
  g.calls.addFinal(call, { speaker: "caller", text: "It's my father, he's 78.", tStartMs: 0, tEndMs: 900 });
  g.calls.addFinal(call, { speaker: "caller", text: "His words come out all mixed up and he can't lift his coffee cup.", tStartMs: 1000, tEndMs: 2000 });
  await until(() => g.calls.registry.get(call.id)?.runner?.state.level === "likely");
  return call;
}

const approve = (g: TestGateway, callId: string) =>
  g.app.inject({ method: "POST", url: `/api/calls/${callId}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } });
const testBriefing = (g: TestGateway, targetPhone = ALLOWED) =>
  g.app.inject({ method: "POST", url: "/api/alerts/test-briefing", headers: auth, payload: { targetPhone } });

describe("flag wiring (proposed D-57)", () => {
  class StubConvexStore extends ConvexStore {
    constructor() {
      super("https://example.convex.cloud", "unused");
    }
  }

  it("both helpers are off by default, and off with the in-memory store even when flagged", async () => {
    gw = testGateway({ store: new StubConvexStore() });
    expect(deps(gw)).toMatchObject({ audioStore: null, callLimiter: null });
    await gw.app.close();
    gw = testGateway({ env: { CONVEX_AUDIO_STORAGE: "true", CONVEX_CALL_RATE_LIMIT: "true" } });
    expect(deps(gw)).toMatchObject({ audioStore: null, callLimiter: null });
  });

  it("each flag wires the Convex store as its helper", async () => {
    const store = new StubConvexStore();
    gw = testGateway({ store, env: { CONVEX_AUDIO_STORAGE: "true" } });
    expect(deps(gw)).toMatchObject({ audioStore: store, callLimiter: null });
    await gw.app.close();
    gw = testGateway({ store, env: { CONVEX_CALL_RATE_LIMIT: "true" } });
    expect(deps(gw)).toMatchObject({ audioStore: null, callLimiter: store });
  });
});

describe("CONVEX_AUDIO_STORAGE (proposed D-57)", () => {
  it("saves the Sonic bytes; after a restart, Call again replays the stored file and skips Sonic", async () => {
    const files = new FakeAudioStore();
    gw = withExtras({ telephonySpeed: 0.0001 }, { audioStore: files }); // never rings: stays `calling`
    const call = await likelyCall(gw);
    const a = (await approve(gw, call.id)).json().alert;
    expect(gw.tts.calls).toEqual([a.briefingText]);
    const original = gw.alerts.registry.get(a.id)!.audio!;
    await until(() => files.files.has(a.id));
    expect(files.files.get(a.id)!.equals(original)).toBe(true);
    expect(files.loads).toBe(0); // a fresh alert never reads storage

    const store = gw.store;
    await gw.app.close();
    gw = withExtras({ store, telephonySpeed: 0.0001 }, { audioStore: files });
    const retry = await gw.app.inject({ method: "POST", url: `/api/alerts/${a.id}/retry`, headers: auth, payload: {} });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().alert.status).toBe("calling");
    expect(gw.tts.calls).toEqual([]); // Sonic skipped
    expect(gw.alerts.registry.get(a.id)!.audio!.equals(original)).toBe(true);
    expect(gw.telephony.placed).toEqual([{ to: ALLOWED, alertId: a.id }]);
  });

  it("Play briefing after a restart (local delivery) serves the stored file without Sonic", async () => {
    const files = new FakeAudioStore();
    gw = withExtras({ env: { ALERT_DELIVERY: "local" } }, { audioStore: files });
    const call = await likelyCall(gw);
    const a = (await approve(gw, call.id)).json().alert;
    await until(() => files.files.has(a.id));
    gw.alerts.registry.delete(a.id); // as after a gateway restart: only the store has it
    const wav = await gw.app.inject({ method: "GET", url: `/api/alerts/${a.id}/audio`, headers: auth });
    expect(wav.statusCode).toBe(200);
    expect(gw.tts.calls).toEqual([a.briefingText]); // only the original synthesis
  });

  it("nothing stored or storage down → re-synthesizes as before (and stores the new bytes)", async () => {
    const files = new FakeAudioStore();
    gw = withExtras({ env: { ALERT_DELIVERY: "local" } }, { audioStore: files });
    const call = await likelyCall(gw);
    const a = (await approve(gw, call.id)).json().alert;
    await until(() => files.files.has(a.id));
    files.files.clear();
    gw.alerts.registry.delete(a.id);
    expect((await gw.app.inject({ method: "GET", url: `/api/alerts/${a.id}/audio`, headers: auth })).statusCode).toBe(200);
    expect(gw.tts.calls).toEqual([a.briefingText, a.briefingText]);
    await until(() => files.files.has(a.id));

    files.failLoad = true;
    gw.alerts.registry.delete(a.id);
    expect((await gw.app.inject({ method: "GET", url: `/api/alerts/${a.id}/audio`, headers: auth })).statusCode).toBe(200);
    expect(gw.tts.calls).toHaveLength(3);
  });

  it("flag off: the restart path re-synthesizes and nothing is stored (V-10 unchanged)", async () => {
    gw = testGateway({ telephonySpeed: 0.0001 });
    expect(deps(gw).audioStore).toBeNull();
    const call = await likelyCall(gw);
    const a = (await approve(gw, call.id)).json().alert;
    const store = gw.store;
    await new Promise((r) => setTimeout(r, 20));
    await gw.app.close();
    gw = testGateway({ store, telephonySpeed: 0.0001 });
    expect((await gw.app.inject({ method: "POST", url: `/api/alerts/${a.id}/retry`, headers: auth, payload: {} })).statusCode).toBe(200);
    expect(gw.tts.calls).toEqual([a.briefingText]);
  });
});

describe("CONVEX_CALL_RATE_LIMIT (proposed D-57)", () => {
  it("allows 3 calls per number, then 409 rate_limited with no call placed", async () => {
    const limiter = new FakeLimiter(3);
    gw = withExtras({ telephonySpeed: 1000 }, { callLimiter: limiter });
    for (let i = 0; i < 3; i++) expect((await testBriefing(gw)).statusCode).toBe(200);
    const limited = await testBriefing(gw);
    expect(limited.statusCode).toBe(409);
    expect(limited.json().error.code).toBe("rate_limited");
    expect(limited.json().error.message).toMatch(/try again in 420 s/);
    expect(limited.json().error.message).not.toMatch(/allow/i); // the web shows "allow" errors as the D-35 allowlist text
    expect(gw.telephony.placed).toHaveLength(3);
  });

  it("approve and Call again are limited too", async () => {
    const limiter = new FakeLimiter(1);
    gw = withExtras({ telephonySpeed: 0.0001 }, { callLimiter: limiter });
    const call = await likelyCall(gw);
    const a = (await approve(gw, call.id)).json().alert;
    const retry = await gw.app.inject({ method: "POST", url: `/api/alerts/${a.id}/retry`, headers: auth, payload: {} });
    expect(retry.statusCode).toBe(409);
    expect(retry.json().error.code).toBe("rate_limited");
    expect(gw.telephony.placed).toHaveLength(1);

    const second = await likelyCall(gw);
    const refused = await approve(gw, second.id);
    expect(refused.json().error.code).toBe("rate_limited");
    expect(gw.alerts.registry.forCall(second.id)).toEqual([]); // refused before any alert row
    // Recorded in the call's audit trail like an allowlist refusal.
    expect(gw.calls.registry.get(second.id)!.audit).toContainEqual(
      expect.objectContaining({ type: "dispatcher", action: "approve", alertId: null, detail: "refused: alert-call rate limit reached, no call placed" }),
    );
  });

  it("the allowlist still applies first; local delivery places no call and takes no credit", async () => {
    const limiter = new FakeLimiter(3);
    gw = withExtras({ telephonySpeed: 1000 }, { callLimiter: limiter });
    const refused = await testBriefing(gw, NOT_ALLOWED);
    expect(refused.json().error.code).toBe("not_allowed");
    expect(limiter.taken).toEqual([]);
    await gw.app.close();
    gw = withExtras({ env: { ALERT_DELIVERY: "local" } }, { callLimiter: limiter });
    for (let i = 0; i < 4; i++) expect((await testBriefing(gw)).statusCode).toBe(200);
    expect(limiter.taken).toEqual([]);
  });

  it("Convex unreachable → the call goes ahead (the allowlist still guards it)", async () => {
    const limiter = new FakeLimiter(3);
    limiter.fail = true;
    gw = withExtras({ telephonySpeed: 1000 }, { callLimiter: limiter });
    expect((await testBriefing(gw)).statusCode).toBe(200);
    expect(gw.telephony.placed).toHaveLength(1);
  });

  it("flag off: no limit (4 calls in a row go through)", async () => {
    gw = testGateway({ telephonySpeed: 1000 });
    expect(deps(gw).callLimiter).toBeNull();
    for (let i = 0; i < 4; i++) expect((await testBriefing(gw)).statusCode).toBe(200);
    expect(gw.telephony.placed).toHaveLength(4);
  });
});
