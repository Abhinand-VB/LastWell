// @vitest-environment edge-runtime
// Proposed D-57: convex/audio.ts (file storage) and convex/limits.ts (rate-limiter component), in memory with convex-test.
import { convexTest } from "convex-test";
import type { GenericId } from "convex/values";
import { api } from "./convexApi.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema.js";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const modules = {
  ...import.meta.glob("../../convex/**/*.ts"),
  "../../convex/_generated/api.js": async () => ({}),
};

const SECRET = "test-secret";
const s = { secret: SECRET };
const CALL = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607";
const TEST_CALL = "7e570000-0000-4000-8000-000000000000";
const ALERT = "9e8d7c6b-5a49-4382-a716-05f4e3d2c1b0";
const PHONE = "+14155550100";
const OTHER_PHONE = "+14155550101";

// The component's test helper is TypeScript source that pulls in vite/client types, whose ImportMeta.glob
// clashes with the declaration above (and in convexStore.test.ts). A runtime-only import keeps tsc out of it.
const RATE_LIMITER_TEST = "@convex-dev/rate-limiter/test";
const { register: registerRateLimiter } = (await import(/* @vite-ignore */ RATE_LIMITER_TEST)) as {
  register: (t: ReturnType<typeof convexTest>, name?: string) => unknown;
};

function setup() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}

async function seedAlert(t: ReturnType<typeof setup>, callId = CALL, alertId = ALERT, label: string | null = null) {
  await t.mutation(api.store.insertCall, {
    ...s,
    call: { callId, mode: "replay", twilioCallSid: null, callerNumber: null, label, timezone: "America/Los_Angeles", startedAt: "2026-10-25T14:47:00-07:00" },
  });
  await t.mutation(api.store.insertAlert, {
    ...s,
    alert: { alertId, callId, targetPhone: PHONE, status: "queued", briefingText: "Stroke pre-alert…", caseSnapshot: {}, transcriptSnapshot: [], twilioCallSid: null, createdAt: "2026-10-25T14:48:00-07:00" },
  });
}

const storeBytes = (t: ReturnType<typeof setup>, bytes: number[]) =>
  t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: "audio/basic" })));
const fileCount = (t: ReturnType<typeof setup>) => t.run(async (ctx) => (await ctx.db.system.query("_storage").collect()).length);

describe("convex audio storage (proposed D-57)", () => {
  beforeEach(() => vi.stubEnv("INTERNAL_API_KEY", SECRET));
  afterEach(() => vi.unstubAllEnvs());

  it("issues an upload URL, links a file to the alert and returns its download URL", async () => {
    const t = setup();
    await seedAlert(t);
    expect(typeof (await t.mutation(api.audio.generateUploadUrl, s))).toBe("string");
    expect(await t.query(api.audio.briefingAudioUrl, { ...s, alertId: ALERT })).toBeNull();

    const first = await storeBytes(t, [0xff, 0x7f]);
    expect(await t.mutation(api.audio.attachBriefingAudio, { ...s, alertId: ALERT, storageId: first })).toBe(true);
    expect(await t.query(api.audio.briefingAudioUrl, { ...s, alertId: ALERT })).toEqual(expect.any(String));

    // A newer file replaces (and deletes) the older one.
    const second = await storeBytes(t, [0x00]);
    await t.mutation(api.audio.attachBriefingAudio, { ...s, alertId: ALERT, storageId: second });
    expect(await fileCount(t)).toBe(1);
    const row = await t.run((ctx) => ctx.db.query("alerts").first());
    expect(row?.audioStorageId).toBe(second);
  });

  it("an upload for an unknown alert is discarded; every function needs the secret", async () => {
    const t = setup();
    const id = await storeBytes(t, [1, 2, 3]);
    expect(await t.mutation(api.audio.attachBriefingAudio, { ...s, alertId: "unknown", storageId: id })).toBe(false);
    expect(await fileCount(t)).toBe(0);
    await expect(t.mutation(api.audio.generateUploadUrl, { secret: "nope" })).rejects.toThrow(/unauthorized/);
    await expect(t.mutation(api.audio.attachBriefingAudio, { secret: "nope", alertId: ALERT, storageId: id as GenericId<"_storage"> })).rejects.toThrow(/unauthorized/);
    await expect(t.query(api.audio.briefingAudioUrl, { secret: "nope", alertId: ALERT })).rejects.toThrow(/unauthorized/);
  });

  it("clearing TEST calls and the wipe delete the stored audio too", async () => {
    const t = setup();
    await seedAlert(t, TEST_CALL, "a-test", "TEST");
    await t.mutation(api.audio.attachBriefingAudio, { ...s, alertId: "a-test", storageId: await storeBytes(t, [9]) });
    await t.mutation(api.store.deleteTestCalls, s);
    expect(await fileCount(t)).toBe(0);

    await seedAlert(t);
    await t.mutation(api.audio.attachBriefingAudio, { ...s, alertId: ALERT, storageId: await storeBytes(t, [9]) });
    await t.mutation(api.store.wipe, s);
    expect(await fileCount(t)).toBe(0);
  });
});

describe("convex call rate limit (proposed D-57)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("INTERNAL_API_KEY", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("3 calls per number per 10 minutes; other numbers unaffected; the window refills", async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) expect(await t.mutation(api.limits.takeAlertCall, { ...s, phone: PHONE })).toEqual({ ok: true });
    const refused = await t.mutation(api.limits.takeAlertCall, { ...s, phone: PHONE });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.retryAfterMs).toBeGreaterThan(0);
      expect(refused.retryAfterMs).toBeLessThanOrEqual(10 * 60_000);
    }
    expect(await t.mutation(api.limits.takeAlertCall, { ...s, phone: OTHER_PHONE })).toEqual({ ok: true });
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(await t.mutation(api.limits.takeAlertCall, { ...s, phone: PHONE })).toEqual({ ok: true });
  });

  it("needs the secret", async () => {
    const t = setup();
    await expect(t.mutation(api.limits.takeAlertCall, { secret: "nope", phone: PHONE })).rejects.toThrow(/unauthorized/);
  });
});
