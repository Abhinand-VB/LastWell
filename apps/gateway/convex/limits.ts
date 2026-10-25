// Proposed D-57 (CONVEX_CALL_RATE_LIMIT): at most 3 outbound alert calls per target number per 10
// minutes, with the @convex-dev/rate-limiter component. The gateway checks this in addition to
// ALERT_ALLOWED_NUMBERS (D-35), never instead of it.
import { v } from "convex/values";
import { componentsGeneric } from "convex/server";
import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import type { ComponentApi } from "@convex-dev/rate-limiter/_generated/component.js";
import { assertSecret, mutation } from "./lib.js";

export const ALERT_CALLS_PER_WINDOW = 3;
export const ALERT_CALL_WINDOW_MS = 10 * MINUTE;

// Same reference `components.rateLimiter` from convex/_generated/api, without needing codegen.
const components = componentsGeneric() as unknown as { rateLimiter: ComponentApi };

const limiter = new RateLimiter(components.rateLimiter, {
  alertCall: { kind: "fixed window", rate: ALERT_CALLS_PER_WINDOW, period: ALERT_CALL_WINDOW_MS },
});

/** Gateway only: consume one outbound-call credit for `phone`. `retryAfterMs` is set when refused. */
export const takeAlertCall = mutation({
  args: { secret: v.string(), phone: v.string() },
  handler: async (ctx, { secret, phone }) => {
    assertSecret(secret);
    const { ok, retryAfter } = await limiter.limit(ctx, "alertCall", { key: phone });
    return ok ? { ok: true as const } : { ok: false as const, retryAfterMs: Math.max(0, Math.ceil(retryAfter ?? 0)) };
  },
});
