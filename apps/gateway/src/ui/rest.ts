// REST /api/* (docs/03 §6), header x-internal-key. Live calls are answered from memory; older ones
// from the store. Dev routes (docs/10 §4.1) are registered only when a fake is active and not DEMO_MODE.
import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod/v4";
import {
  AlertsQuery,
  CreateAlertBody,
  EmsConfirmBody,
  ReplayBody,
  Speaker,
  TestBriefingBody,
  type CallListItem,
  type CallSnapshot,
  type ConfigResponse,
} from "@lastwell/core";
import type { ActionResult, AlertService } from "../alerts/approve.js";
import { toSummary } from "../alerts/alertRegistry.js";
import type { CallService } from "../pipeline/calls.js";
import { callInfo } from "../pipeline/callRegistry.js";
import { loadReplayScript, ReplayError, startReplay } from "../pipeline/replay.js";
import type { Repo } from "../store/repo.js";
import type { TokenStore } from "./tokens.js";

export interface RestDeps {
  calls: CallService;
  alerts: AlertService;
  repo: Repo;
  tokens: TokenStore;
  internalKey: string;
  config: ConfigResponse;
  evalScriptsDir: string;
  devRoutes: boolean;
}

export function keyMatches(expected: string, got: unknown): boolean {
  if (typeof got !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

function err(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

function sendResult<T>(reply: FastifyReply, r: ActionResult<T>, wrap: (v: T) => unknown) {
  if (!r.ok) return err(reply, r.status, r.code, r.message);
  return reply.send(wrap(r.value));
}

function parse<T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | null {
  const r = schema.safeParse(body ?? {});
  if (r.success) return r.data;
  void err(reply, 400, "bad_request", r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return null;
}

/** Snapshot of a call: memory first, then the store. */
export async function callSnapshot(deps: Pick<RestDeps, "calls" | "alerts" | "repo">, callId: string): Promise<CallSnapshot | null> {
  const live = deps.calls.registry.get(callId);
  if (live) return deps.calls.snapshotOf(live, deps.alerts.registry.forCall(callId).map(toSummary));
  const stored = await deps.repo.getCall(callId);
  if (!stored || !stored.caseState) return null;
  const c = stored.call;
  return {
    callId,
    call: callInfo({ id: c.callId, mode: c.mode, callerNumber: c.callerNumber, startedAt: c.startedAt, endedAt: c.endedAt, status: c.status, timezone: c.timezone, label: c.label }),
    utterances: stored.utterances,
    state: stored.caseState,
    alerts: stored.alerts.map(toSummary),
  };
}

const DevUtterance = z.object({ speaker: Speaker, text: z.string().min(1) });
const Params = z.object({ callId: z.string() });
const AlertParams = z.object({ alertId: z.string() });

export function registerRest(app: FastifyInstance, deps: RestDeps): void {
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith("/api/")) return;
    if (!keyMatches(deps.internalKey, req.headers["x-internal-key"])) return err(reply, 401, "unauthorized", "missing or wrong x-internal-key");
  });

  app.get("/api/config", async () => deps.config);
  app.get("/api/ws-token", async () => deps.tokens.issue());

  app.get("/api/calls", async () => {
    const out = new Map<string, CallListItem>();
    const live = deps.calls.registry.list().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    for (const c of live) out.set(c.id, { ...callInfo(c), level: c.runner?.state.level ?? "none" });
    for (const { call: c, level } of await deps.repo.listCalls(20)) {
      if (out.has(c.callId)) continue;
      out.set(c.callId, {
        ...callInfo({ id: c.callId, mode: c.mode, callerNumber: c.callerNumber, startedAt: c.startedAt, endedAt: c.endedAt, status: c.status, timezone: c.timezone, label: c.label }),
        level,
      });
    }
    const calls = [...out.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 20);
    return { calls };
  });

  app.get("/api/calls/:callId", async (req, reply) => {
    const { callId } = Params.parse(req.params);
    const snap = await callSnapshot(deps, callId);
    if (!snap) return err(reply, 404, "unknown_call", `unknown call ${callId}`);
    return snap;
  });

  app.post("/api/calls/:callId/alert", async (req, reply) => {
    const { callId } = Params.parse(req.params);
    const body = parse(CreateAlertBody, req.body, reply);
    if (!body) return reply;
    return sendResult(reply, await deps.alerts.approve(callId, body.targetPhone), (alert) => ({ alert }));
  });

  app.post("/api/calls/replay", async (req, reply) => {
    const body = parse(ReplayBody, req.body, reply);
    if (!body) return reply;
    try {
      const script = loadReplayScript(deps.evalScriptsDir, body.scriptId);
      const call = startReplay(deps.calls, script, body.speed ?? 2);
      return { callId: call.id };
    } catch (e) {
      if (e instanceof ReplayError) return err(reply, e.status, e.status === 404 ? "unknown_script" : "bad_request", e.message);
      throw e;
    }
  });

  app.get("/api/alerts", async (req, reply) => {
    const q = parse(AlertsQuery, req.query, reply);
    if (!q) return reply;
    return { alerts: await deps.alerts.board(Date.now() - q.sinceHours * 3600_000) };
  });

  app.post("/api/alerts/test-briefing", async (req, reply) => {
    const body = parse(TestBriefingBody, req.body, reply);
    if (!body) return reply;
    return sendResult(reply, await deps.alerts.testBriefing(body.targetPhone), (alert) => ({ alert }));
  });

  app.delete("/api/alerts/test", async () => ({ deleted: await deps.alerts.deleteTest() }));

  app.post("/api/alerts/:alertId/ems-confirm", async (req, reply) => {
    const { alertId } = AlertParams.parse(req.params);
    const body = parse(EmsConfirmBody, req.body, reply);
    if (!body) return reply;
    return sendResult(reply, await deps.alerts.emsConfirm(alertId, body.confirmed), (alert) => ({ alert }));
  });

  app.post("/api/alerts/:alertId/hangup", async (req, reply) => {
    const { alertId } = AlertParams.parse(req.params);
    return sendResult(reply, await deps.alerts.hangup(alertId), () => ({ ok: true }));
  });

  app.post("/api/alerts/:alertId/retry", async (req, reply) => {
    const { alertId } = AlertParams.parse(req.params);
    return sendResult(reply, await deps.alerts.retry(alertId), (alert) => ({ alert }));
  });

  if (!deps.devRoutes) return;

  // docs/10 §4.1: dev-only, as if Twilio had connected (mode phone, label dev).
  app.post("/api/dev/calls", async (_req, reply) => {
    const call = deps.calls.create({ mode: "phone", label: "dev", streamStartedNow: true });
    return reply.code(201).send({ callId: call.id });
  });

  app.post("/api/dev/calls/:callId/utterances", async (req, reply) => {
    const { callId } = Params.parse(req.params);
    const body = parse(DevUtterance, req.body, reply);
    if (!body) return reply;
    const call = deps.calls.registry.get(callId);
    if (!call) return err(reply, 404, "unknown_call", `unknown call ${callId}`);
    if (call.status !== "live") return err(reply, 409, "call_ended", "call has ended");
    const t = deps.calls.elapsedMs(call);
    const u = deps.calls.addFinal(call, { speaker: body.speaker, text: body.text, tStartMs: t, tEndMs: t + 1500 });
    return reply.code(201).send({ utterance: u });
  });

  app.post("/api/dev/calls/:callId/end", async (req, reply) => {
    const { callId } = Params.parse(req.params);
    const call = deps.calls.registry.get(callId);
    if (!call) return err(reply, 404, "unknown_call", `unknown call ${callId}`);
    void deps.calls.end(call);
    return { ok: true };
  });
}
