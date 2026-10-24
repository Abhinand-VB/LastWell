// Public flags from GET /api/config (docs/03 §6), loaded once per page load.
import { ConfigResponse, E164 } from "@lastwell/core";

// wired-to-fake: `alertDefaultTargetPhone` is requested from reasoning (contract) and voice
// (/api/config) so the Send modal can prefill ALERT_DEFAULT_TARGET_PHONE (D-30). Until it lands
// the field is optional and the modal falls back to a typed number.
export const WebConfig = ConfigResponse.extend({ alertDefaultTargetPhone: E164.nullable().optional() });
export type WebConfig = ReturnType<typeof WebConfig.parse>;

export const FALLBACK_CONFIG: WebConfig = {
  demoAlertToCaller: false,
  featureBrowserMic: true,
  featureQa: false,
  callTimezone: "America/Los_Angeles",
  alertDefaultTargetPhone: null,
};

let pending: Promise<WebConfig> | null = null;

export function loadConfig(): Promise<WebConfig> {
  if (!pending) {
    pending = fetch("/api/gateway/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`config ${r.status}`))))
      .then((json) => WebConfig.parse(json))
      .catch((err) => {
        pending = null; // retry on the next caller
        throw err;
      });
  }
  return pending;
}

export function wsUrl(): string {
  return process.env.NEXT_PUBLIC_GATEWAY_WS_URL ?? "ws://localhost:8787/ws/ui";
}
