// Public flags from GET /api/config (docs/03 §6), loaded once per page load.
import { ConfigResponse } from "@lastwell/core";
import { z } from "zod/v4";

// alertDelivery (D-43) is served by the gateway but not yet in core's ConfigResponse; phone is the default.
export const WebConfig = ConfigResponse.extend({
  alertDelivery: z.enum(["phone", "local"]).default("phone"),
});
export type WebConfig = ReturnType<typeof WebConfig.parse>;

export const FALLBACK_CONFIG: WebConfig = {
  demoAlertToCaller: false,
  featureBrowserMic: true,
  featureQa: false,
  callTimezone: "America/Los_Angeles",
  alertDefaultTargetPhone: null,
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
