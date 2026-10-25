// Public flags from GET /api/config (docs/03 §6), loaded once per page load.
import { ConfigResponse } from "@lastwell/core";
import { z } from "zod/v4";

// alertDelivery (D-43) is in core's ConfigResponse since D-45; default "phone" so an older gateway still loads.
// alertAllowedNumbers (D-58) defaults to [] for the same reason: the Send modal then shows only the typed field.
export const WebConfig = ConfigResponse.extend({
  alertDelivery: z.enum(["phone", "local"]).default("phone"),
  alertAllowedNumbers: z.array(z.string().regex(/^\+[1-9]\d{6,14}$/)).default([]),
});
export type WebConfig = ReturnType<typeof WebConfig.parse>;

export const FALLBACK_CONFIG: WebConfig = {
  demoAlertToCaller: false,
  featureBrowserMic: true,
  featureQa: false,
  callTimezone: "America/Los_Angeles",
  alertDefaultTargetPhone: null,
  alertAllowedNumbers: [],
  alertDelivery: "phone",
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
