// docs/03 §6 — REST bodies and responses (`https://{gateway}/api/*`, header `x-internal-key`).
import { z } from "zod/v4";
import { E164, Level } from "./primitives.js";
import { AlertSummary, CallInfo, CallSnapshot } from "./ui.js";

export const HealthzResponse = z.object({
  ok: z.boolean(),
  uptimeS: z.number().int().nonnegative(),
  liveCalls: z.number().int().nonnegative(),
  cartesia: z.enum(["ok", "degraded"]),
  version: z.string(),
});
export type HealthzResponse = z.infer<typeof HealthzResponse>;

export const ConfigResponse = z.object({
  demoAlertToCaller: z.boolean(),
  featureBrowserMic: z.boolean(),
  featureQa: z.boolean(),
  callTimezone: z.string(),
  alertDefaultTargetPhone: E164.nullable(), // ALERT_DEFAULT_TARGET_PHONE; the Send modal prefills it (D-30, D-39)
  alertDelivery: z.enum(["phone", "local"]), // ALERT_DELIVERY: "local" = the console plays the briefing (D-43, D-45)
});
export type ConfigResponse = z.infer<typeof ConfigResponse>;

export const WsTokenResponse = z.object({ token: z.string(), expiresInS: z.number().int().positive() });
export type WsTokenResponse = z.infer<typeof WsTokenResponse>;

export const CallListItem = CallInfo.extend({ level: Level });
export type CallListItem = z.infer<typeof CallListItem>;

export const CallsListResponse = z.object({ calls: z.array(CallListItem) });
export type CallsListResponse = z.infer<typeof CallsListResponse>;

/** `GET /api/calls/:callId` — same payload as the WS `snapshot` message. */
export const CallSnapshotResponse = CallSnapshot;
export type CallSnapshotResponse = CallSnapshot;

export const EmptyBody = z.object({});

export const BrowserCallResponse = z.object({ callId: z.string(), micWsUrl: z.string() });
export type BrowserCallResponse = z.infer<typeof BrowserCallResponse>;

export const CreateAlertBody = z.object({ targetPhone: E164, confirm: z.literal(true) });
export type CreateAlertBody = z.infer<typeof CreateAlertBody>;

export const EmsConfirmBody = z.object({ confirmed: z.boolean() });
export type EmsConfirmBody = z.infer<typeof EmsConfirmBody>;

export const TestBriefingBody = z.object({ targetPhone: E164 });
export type TestBriefingBody = z.infer<typeof TestBriefingBody>;

export const ReplayBody = z.object({
  scriptId: z.string().regex(/^[A-E]\d{2}$/),
  speed: z.number().positive().optional(),
});
export type ReplayBody = z.infer<typeof ReplayBody>;

export const ReplayResponse = z.object({ callId: z.string() });
export type ReplayResponse = z.infer<typeof ReplayResponse>;

export const AlertResponse = z.object({ alert: AlertSummary });
export type AlertResponse = z.infer<typeof AlertResponse>;

export const AlertsListResponse = z.object({ alerts: z.array(AlertSummary) });
export type AlertsListResponse = z.infer<typeof AlertsListResponse>;

export const OkResponse = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponse>;

export const DeletedResponse = z.object({ deleted: z.number().int().nonnegative() });
export type DeletedResponse = z.infer<typeof DeletedResponse>;

/** `GET /api/alerts?sinceHours=24` */
export const AlertsQuery = z.object({ sinceHours: z.coerce.number().positive().default(24) });
export type AlertsQuery = z.infer<typeof AlertsQuery>;

/** Errors: 400 validation, 401 key/token, 404 unknown id, 409 state conflict, 502 vendor (message names it). */
export const ApiError = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export type ApiError = z.infer<typeof ApiError>;

/** `WS /browser/media/:callId` text frame; audio arrives as binary pcm_s16le 16 kHz frames. */
export const BrowserMediaControl = z.object({ type: z.literal("end") });
export type BrowserMediaControl = z.infer<typeof BrowserMediaControl>;
