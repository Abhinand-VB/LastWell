// Dev-only stand-in for the gateway's UI surface (docs/03 §5, §6) so the screens can be built and
// demoed before V-04/V-11 land and without keys. NOT the real gateway: states are derived from the
// core fixtures (caseState.{A01,B01,C01}.json) revealed turn by turn as the eval script plays.
//   pnpm --filter @lastwell/web mock:gateway            (port MOCK_PORT, default 8787)
// Env: MOCK_PORT, MOCK_ALLOWED (comma-separated E.164, default +14155550100), MOCK_AUTOREPLAY=A01.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import {
  CaseState,
  EvalScript,
  composeBriefing,
  guardLevel,
  nextQuestion,
  parseLkw,
  type AlertSummary,
  type CallInfo,
  type UiServerMessage,
  type Utterance,
} from "@lastwell/core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..", "..", "..");
const PORT = Number(process.env.MOCK_PORT ?? 8787);
const ALLOWED = (process.env.MOCK_ALLOWED ?? "+14155550100").split(",").map((s) => s.trim());
const TZ = "America/Los_Angeles";

interface MockCall {
  info: CallInfo;
  utterances: Utterance[];
  state: CaseState;
}
const calls = new Map<string, MockCall>();
const alerts = new Map<string, AlertSummary>();
const tokens = new Set<string>();
const subs = new Map<WebSocket, { callIds: Set<string>; board: boolean }>();

const nowIso = () => new Date().toISOString();
const mask = (n: string) => `•••${n.slice(-4)}`;

function send(ws: WebSocket, msg: UiServerMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
function toCall(callId: string, msg: UiServerMessage) {
  for (const [ws, s] of subs) if (s.callIds.has(callId)) send(ws, msg);
}
function toBoard(msg: UiServerMessage) {
  for (const [ws, s] of subs) if (s.board) send(ws, msg);
}
function emitAlert(a: AlertSummary) {
  alerts.set(a.id, a);
  toCall(a.callId, { type: "alert.updated", alert: a });
  toBoard({ type: "alert.updated", alert: a });
}

function initialState(callId: string): CaseState {
  return CaseState.parse({
    callId, version: 0, level: "none", modelLevel: "none", signs: [], facts: [], lkw: null, lookalikes: [],
    nextQuestion: null, summary: null, reasonerQuestion: null, droppedCount: 0, warnings: [],
    latency: { fastPassMs: null, reasonerMs: null, sttMs: null }, updatedAt: nowIso(),
  });
}

/** Fixture state restricted to items whose quote was said at or before `seq`, with ids remapped. */
function stateAt(fixture: CaseState, call: MockCall, seq: number, idMap: Map<string, Utterance>): CaseState {
  const seqOf = (id: string) => Number(id.slice(-12));
  const remap = <T extends { ref: { utteranceId: string } }>(x: T): T => {
    const u = idMap.get(x.ref.utteranceId);
    return u ? { ...x, ref: { ...x.ref, utteranceId: u.id, tMs: u.tStartMs } } : x;
  };
  const said = (id: string) => seqOf(id) <= seq;
  const signs = fixture.signs.filter((s) => said(s.ref.utteranceId)).map(remap);
  const facts = fixture.facts.filter((f) => said(f.ref.utteranceId)).map(remap);
  let lkw = null as CaseState["lkw"];
  if (fixture.lkw && said(fixture.lkw.ref.utteranceId)) {
    const u = idMap.get(fixture.lkw.ref.utteranceId)!;
    const saidAt = new Date(Date.parse(call.info.startedAt) + u.tStartMs).toISOString();
    lkw = { ...parseLkw({ phrase: fixture.lkw.phrase, saidAt, timezone: TZ }), ref: remap(fixture.lkw).ref, minutesAgo: null };
  }
  const lookalikes = signs.length === 0 ? [] : fixture.lookalikes
    .filter((l) => !l.ref || said(l.ref.utteranceId))
    .map((l) => (l.ref ? { ...l, ref: remap({ ref: l.ref }).ref } : l));
  const modelLevel = signs.length ? fixture.modelLevel : "none";
  const base = {
    ...call.state, signs, facts, lkw, lookalikes, modelLevel,
    level: guardLevel(signs, modelLevel).level,
    reasonerQuestion: signs.length ? fixture.reasonerQuestion : null,
    summary: signs.length ? fixture.summary : null,
    latency: { fastPassMs: 700 + Math.round(Math.random() * 300), reasonerMs: 2600 + Math.round(Math.random() * 900), sttMs: 400 },
    version: call.state.version + 1, updatedAt: nowIso(),
  };
  return CaseState.parse({ ...base, nextQuestion: nextQuestion(base) });
}

function startReplay(scriptId: string, speed = 1): string {
  const script = EvalScript.parse(JSON.parse(readFileSync(path.join(repo, "apps/eval/scripts", `${scriptId}.json`), "utf8")));
  const fixPath = path.join(repo, "packages/core/src/fixtures", `caseState.${scriptId}.json`);
  const fixture = existsSync(fixPath) ? CaseState.parse(JSON.parse(readFileSync(fixPath, "utf8"))) : null;
  const callId = randomUUID();
  const call: MockCall = {
    info: { id: callId, mode: "replay", callerNumberMasked: null, startedAt: nowIso(), endedAt: null, status: "live", timezone: TZ, label: scriptId },
    utterances: [],
    state: initialState(callId),
  };
  calls.set(callId, call);
  const idMap = new Map<string, Utterance>();
  const prefix = fixture?.callId.slice(0, 24);
  script.turns.forEach((turn, i) => {
    const seq = i + 1;
    const words = turn.text.split(" ");
    const startAt = turn.atMs / speed;
    // a few partials, then the final
    for (let k = 1; k < 4; k++) {
      setTimeout(() => {
        if (call.info.status !== "live") return;
        toCall(callId, { type: "utterance.partial", callId, speaker: turn.speaker, text: words.slice(0, Math.ceil((words.length * k) / 4)).join(" "), tStartMs: turn.atMs });
      }, startAt + k * 350);
    }
    setTimeout(() => {
      const u: Utterance = { id: randomUUID(), callId, seq, speaker: turn.speaker, text: turn.text, tStartMs: turn.atMs, tEndMs: turn.atMs + 1500 };
      call.utterances.push(u);
      if (prefix) idMap.set(`${prefix}${String(seq).padStart(12, "0")}`, u);
      toCall(callId, { type: "utterance.final", callId, utterance: u });
      if (fixture && turn.speaker !== "dispatcher") {
        setTimeout(() => {
          call.state = stateAt(fixture, call, seq, idMap);
          toCall(callId, { type: "state.updated", callId, state: call.state });
        }, 800);
      }
    }, startAt + 1500);
  });
  const last = script.turns.at(-1)?.atMs ?? 0;
  setTimeout(() => {
    call.info = { ...call.info, status: "ended", endedAt: nowIso() };
    toCall(callId, { type: "call.ended", callId, endedAt: call.info.endedAt! });
  }, last / speed + 4000);
  return callId;
}

function driveAlert(id: string) {
  const steps: [number, AlertSummary["status"]][] = [[1000, "ringing"], [3000, "answered"], [9000, "briefed"], [11000, "completed"]];
  for (const [ms, status] of steps) {
    setTimeout(() => {
      const a = alerts.get(id);
      if (!a || a.status === "failed" || a.status === "completed") return;
      emitAlert({ ...a, status });
    }, ms);
  }
}

function createAlert(call: MockCall, targetPhone: string): AlertSummary {
  const a: AlertSummary = {
    id: randomUUID(), callId: call.info.id, targetPhoneMasked: mask(targetPhone), status: "calling",
    briefingText: composeBriefing(call.state, new Date(), TZ, { qaEnabled: false }).text,
    caseSnapshot: call.state, emsConfirmedAt: null, createdAt: nowIso(), lastError: null, qaTurns: [],
  };
  emitAlert(a);
  driveAlert(a.id);
  return a;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
const err = (res: ServerResponse, status: number, code: string, message: string) => json(res, status, { error: { code, message } });

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let s = "";
  for await (const c of req) s += c;
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

const snapshotOf = (c: MockCall) => ({
  callId: c.info.id, call: c.info, utterances: c.utterances, state: c.state,
  alerts: [...alerts.values()].filter((a) => a.callId === c.info.id),
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const p = url.pathname;
  if (p === "/healthz") return json(res, 200, { ok: true, uptimeS: Math.round(process.uptime()), liveCalls: calls.size, cartesia: "ok", version: "mock" });
  if (!p.startsWith("/api/")) return err(res, 404, "not_found", p);
  if (!req.headers["x-internal-key"]) return err(res, 401, "unauthorized", "missing x-internal-key");
  const m = req.method;
  const parts = p.slice(5).split("/");
  const body = m === "POST" ? await readBody(req) : {};

  if (m === "GET" && p === "/api/config")
    return json(res, 200, { demoAlertToCaller: false, featureBrowserMic: true, featureQa: false, callTimezone: TZ, alertDefaultTargetPhone: ALLOWED[0] ?? null });
  if (m === "GET" && p === "/api/ws-token") {
    const token = randomBytes(32).toString("hex");
    tokens.add(token);
    return json(res, 200, { token, expiresInS: 600 });
  }
  if (m === "GET" && p === "/api/calls")
    return json(res, 200, { calls: [...calls.values()].reverse().slice(0, 20).map((c) => ({ ...c.info, level: c.state.level })) });
  if (m === "POST" && p === "/api/calls/replay") {
    const scriptId = String(body.scriptId ?? "");
    if (!/^[A-E]\d{2}$/.test(scriptId) || !existsSync(path.join(repo, "apps/eval/scripts", `${scriptId}.json`))) return err(res, 404, "unknown_script", scriptId);
    return json(res, 200, { callId: startReplay(scriptId, Number(body.speed ?? 1)) });
  }
  if (m === "POST" && p === "/api/calls/browser") {
    const callId = randomUUID();
    calls.set(callId, { info: { id: callId, mode: "browser", callerNumberMasked: null, startedAt: nowIso(), endedAt: null, status: "live", timezone: TZ, label: null }, utterances: [], state: initialState(callId) });
    const token = randomBytes(32).toString("hex");
    tokens.add(token);
    return json(res, 200, { callId, micWsUrl: `ws://localhost:${PORT}/browser/media/${callId}?token=${token}` });
  }
  if (m === "GET" && p === "/api/alerts") return json(res, 200, { alerts: [...alerts.values()] });
  if (m === "POST" && p === "/api/alerts/test-briefing") {
    const target = String(body.targetPhone ?? "");
    if (!ALLOWED.includes(target)) return err(res, 409, "not_allowed", `${target} is not in ALERT_ALLOWED_NUMBERS`);
    const callId = randomUUID();
    const fixture = CaseState.parse(JSON.parse(readFileSync(path.join(repo, "packages/core/src/fixtures/caseState.TEST.json"), "utf8")));
    const c: MockCall = { info: { id: callId, mode: "replay", callerNumberMasked: null, startedAt: nowIso(), endedAt: nowIso(), status: "ended", timezone: TZ, label: "TEST" }, utterances: [], state: { ...fixture, callId } };
    calls.set(callId, c);
    return json(res, 200, { alert: createAlert(c, target) });
  }
  if (m === "DELETE" && p === "/api/alerts/test") {
    let n = 0;
    for (const a of [...alerts.values()]) {
      if (calls.get(a.callId)?.info.label === "TEST") {
        alerts.delete(a.id);
        calls.delete(a.callId);
        n++;
        toBoard({ type: "alert.removed", alertId: a.id });
        toCall(a.callId, { type: "alert.removed", alertId: a.id });
      }
    }
    return json(res, 200, { deleted: n });
  }
  if (parts[0] === "calls" && parts[1]) {
    const c = calls.get(parts[1]);
    if (!c) return err(res, 404, "unknown_call", parts[1]);
    if (m === "GET" && parts.length === 2) return json(res, 200, snapshotOf(c));
    if (m === "POST" && parts[2] === "end") {
      c.info = { ...c.info, status: "ended", endedAt: nowIso() };
      toCall(c.info.id, { type: "call.ended", callId: c.info.id, endedAt: c.info.endedAt! });
      return json(res, 200, { ok: true });
    }
    if (m === "POST" && parts[2] === "alert") {
      const target = String(body.targetPhone ?? "");
      if (body.confirm !== true || !/^\+[1-9]\d{6,14}$/.test(target)) return err(res, 400, "validation", "targetPhone must be E.164 and confirm true");
      if (c.state.level === "none") return err(res, 409, "level_none", "no stroke signs heard yet");
      if ([...alerts.values()].some((a) => a.callId === c.info.id && !["completed", "failed"].includes(a.status)))
        return err(res, 409, "alert_active", "an alert for this call is already in progress");
      if (!ALLOWED.includes(target)) return err(res, 409, "not_allowed", `${target} is not in ALERT_ALLOWED_NUMBERS`);
      return json(res, 200, { alert: createAlert(c, target) });
    }
  }
  if (parts[0] === "alerts" && parts[1]) {
    const a = alerts.get(parts[1]);
    if (!a) return err(res, 404, "unknown_alert", parts[1]);
    if (m === "POST" && parts[2] === "ems-confirm") {
      const next = { ...a, emsConfirmedAt: body.confirmed ? nowIso() : null };
      emitAlert(next);
      return json(res, 200, { alert: next });
    }
    if (m === "POST" && parts[2] === "retry") {
      if (!["calling", "ringing", "failed"].includes(a.status)) return err(res, 409, "bad_state", `cannot retry from ${a.status}`);
      const next = { ...a, status: "calling" as const, lastError: null };
      emitAlert(next);
      driveAlert(a.id);
      return json(res, 200, { alert: next });
    }
    if (m === "POST" && parts[2] === "hangup") {
      emitAlert({ ...a, status: "completed" });
      return json(res, 200, { ok: true });
    }
  }
  return err(res, 404, "not_found", `${m} ${p}`);
});

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/browser/media/")) {
    const u = new URL(req.url, "http://x");
    if (!tokens.has(u.searchParams.get("token") ?? "")) return socket.destroy();
    return wss.handleUpgrade(req, socket, head, (ws) => {
      // Report frame sizes and cadence so W-08 can be checked without the real gateway.
      let n = 0;
      let first = 0;
      const sizes = new Map<number, number>();
      ws.on("message", (data, isBinary) => {
        if (!isBinary) return console.log(`[mock-gateway] mic control ${String(data)}`);
        const len = (data as Buffer).length;
        sizes.set(len, (sizes.get(len) ?? 0) + 1);
        if (n++ === 0) first = Date.now();
        if (n % 250 === 0) console.log(`[mock-gateway] mic ${n} frames, sizes ${JSON.stringify([...sizes])}, ${((Date.now() - first) / (n - 1)).toFixed(1)} ms/frame`);
      });
      ws.on("close", () => console.log(`[mock-gateway] mic closed after ${n} frames, sizes ${JSON.stringify([...sizes])}`));
    });
  }
  if (!req.url?.startsWith("/ws/ui")) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    let authed = false;
    subs.set(ws, { callIds: new Set(), board: false });
    ws.on("close", () => subs.delete(ws));
    ws.on("message", (data) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return send(ws, { type: "error", code: "bad_message", message: "not json" });
      }
      if (msg.type === "auth") {
        if (!tokens.has(String(msg.token))) {
          send(ws, { type: "error", code: "unauthorized", message: "bad token" });
          return ws.close(4001);
        }
        authed = true;
        return send(ws, { type: "auth.ok" });
      }
      if (!authed) return send(ws, { type: "error", code: "unauthorized", message: "auth first" });
      const s = subs.get(ws)!;
      if (msg.type === "ping") return send(ws, { type: "pong" });
      if (msg.type === "subscribe" && msg.scope === "board") {
        s.board = true;
        return send(ws, { type: "board.snapshot", alerts: [...alerts.values()] });
      }
      if (msg.type === "subscribe" && msg.scope === "call") {
        const c = calls.get(String(msg.callId));
        if (!c) return send(ws, { type: "error", code: "unknown_call", message: String(msg.callId) });
        s.callIds.add(c.info.id);
        return send(ws, { type: "snapshot", ...snapshotOf(c) });
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`[mock-gateway] listening on ${PORT} (NOT the real gateway; allowlist ${ALLOWED.join(",")})`);
  const auto = process.env.MOCK_AUTOREPLAY;
  if (auto) {
    const run = () => console.log(`[mock-gateway] replay ${auto} → ${startReplay(auto)}`);
    run();
    setInterval(run, 90_000);
  }
});
