// Proposed D-57: how the stroke-team board stays live. `ws` (default) is the gateway WebSocket +
// polling path (useBoard); `convex` reads convex/board.ts:listAlerts with a Convex live query.
import { AlertStatus, AlertSummary, CallStatus, FactKind, Level, SignKind } from "@lastwell/core";
import { z } from "zod/v4";

export type BoardLiveMode = "ws" | "convex";

/** Anything other than exactly "convex" keeps the WebSocket board. */
export function boardLiveMode(raw: string | undefined): BoardLiveMode {
  return raw?.trim().toLowerCase() === "convex" ? "convex" : "ws";
}

/** Next inlines NEXT_PUBLIC_* only when written out literally. */
export const BOARD_LIVE: BoardLiveMode = boardLiveMode(process.env.NEXT_PUBLIC_BOARD_LIVE);

/** What board:listAlerts returns (convex/board.ts), validated at the boundary like every REST response. */
export const BoardQueryResult = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(false), error: z.literal("unauthorized") }),
  z.object({
    ok: z.literal(true),
    items: z.array(z.object({ label: z.string().nullable(), alert: AlertSummary })),
  }),
]);
export type BoardQueryResult = z.infer<typeof BoardQueryResult>;

const HOUR_MS = 3600_000;

/** now − 24 h, floored to the hour so the query arguments (and its subscription) stay stable. */
export function boardSinceMs(nowMs: number): number {
  return Math.floor((nowMs - 24 * HOUR_MS) / HOUR_MS) * HOUR_MS;
}

/** Fetch the next board token at half its lifetime (≥ 5 s), well before Convex expires it. */
export function tokenRefreshDelayMs(expiresInS: number): number {
  return Math.max(5_000, Math.floor((expiresInS * 1000) / 2));
}

const Quoted = z.object({ quote: z.string(), tMs: z.number() });

/** What board:callEvidence returns (convex/board.ts): quoted evidence only, never the transcript. */
export const EvidenceResult = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(false), error: z.enum(["unauthorized", "not_found"]) }),
  z.object({
    ok: z.literal(true),
    evidence: z.object({
      callId: z.string(),
      label: z.string().nullable(),
      callStatus: CallStatus,
      startedAt: z.string(),
      level: Level,
      version: z.number(),
      updatedAt: z.string(),
      signs: z.array(Quoted.extend({ kind: SignKind })),
      facts: z.array(Quoted.extend({ kind: FactKind, value: z.string() })),
      lkw: Quoted.extend({ display: z.string(), lkwAt: z.string().nullable() }).nullable(),
      lookalikes: z.array(z.object({ name: z.string(), ref: Quoted.nullable() })),
      alerts: z.array(z.object({ id: z.string(), status: AlertStatus, createdAt: z.string(), emsConfirmedAt: z.string().nullable() })),
    }),
  }),
]);
export type EvidenceResult = z.infer<typeof EvidenceResult>;
export type Evidence = Extract<EvidenceResult, { ok: true }>["evidence"];

/** "blood_thinner" → "Blood thinner". */
export function factLabel(kind: string): string {
  const t = kind.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
