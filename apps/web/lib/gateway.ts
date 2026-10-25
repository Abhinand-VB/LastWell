// Browser-side REST client. Every call goes through the Next.js proxy (/api/gateway/*), which adds
// the internal key; responses are validated with the docs/03 §6 schemas.
import {
  AlertResponse,
  AlertsListResponse,
  ApiError,
  BrowserCallResponse,
  CallSnapshotResponse,
  CallsListResponse,
  DeletedResponse,
  OkResponse,
  ReplayResponse,
  WsTokenResponse,
} from "@lastwell/core";
import type { z } from "zod/v4";

export class GatewayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

const BASE = "/api/gateway";

async function request<S extends z.ZodType>(
  schema: S,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    throw new GatewayError(0, "network", err instanceof Error ? err.message : "network error");
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    // fall through: non-JSON body
  }
  if (!res.ok) {
    const parsed = ApiError.safeParse(json);
    if (parsed.success) throw new GatewayError(res.status, parsed.data.error.code, parsed.data.error.message);
    throw new GatewayError(res.status, "http_error", `${method} ${path} failed with ${res.status}`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new GatewayError(res.status, "bad_response", `unexpected response from ${path}`);
  return parsed.data;
}

const id = (s: string) => encodeURIComponent(s);

export const gateway = {
  wsToken: () => request(WsTokenResponse, "GET", "ws-token"),
  /** Proposed D-57: read token for the board's Convex live query (same shape as the ws token). */
  boardToken: () => request(WsTokenResponse, "GET", "board-token"),
  listCalls: () => request(CallsListResponse, "GET", "calls"),
  getCall: (callId: string) => request(CallSnapshotResponse, "GET", `calls/${id(callId)}`),
  startBrowserCall: () => request(BrowserCallResponse, "POST", "calls/browser", {}),
  endCall: (callId: string) => request(OkResponse, "POST", `calls/${id(callId)}/end`, {}),
  /** D-53 extras (`notes`, `override`) are not in core's CreateAlertBody yet; docs/03 §6 has them. */
  sendAlert: (callId: string, targetPhone: string, extras: { notes?: string; override?: true } = {}) =>
    request(AlertResponse, "POST", `calls/${id(callId)}/alert`, { targetPhone, confirm: true, ...extras }),
  emsConfirm: (alertId: string, confirmed: boolean) =>
    request(AlertResponse, "POST", `alerts/${id(alertId)}/ems-confirm`, { confirmed }),
  hangup: (alertId: string) => request(OkResponse, "POST", `alerts/${id(alertId)}/hangup`, {}),
  played: (alertId: string) => request(AlertResponse, "POST", `alerts/${id(alertId)}/played`, {}),
  /** D-43 local delivery: the briefing WAV, streamed through the proxy. */
  audioUrl: (alertId: string) => `${BASE}/alerts/${id(alertId)}/audio`,
  retry: (alertId: string) => request(AlertResponse, "POST", `alerts/${id(alertId)}/retry`, {}),
  testBriefing: (targetPhone: string) => request(AlertResponse, "POST", "alerts/test-briefing", { targetPhone }),
  clearTestAlerts: () => request(DeletedResponse, "DELETE", "alerts/test"),
  replay: (scriptId: string, speed?: number) =>
    request(ReplayResponse, "POST", "calls/replay", speed === undefined ? { scriptId } : { scriptId, speed }),
  listAlerts: (sinceHours = 24) => request(AlertsListResponse, "GET", `alerts?sinceHours=${sinceHours}`),
};
