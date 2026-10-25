// Proposed D-57: the rate-limiter component gates outbound alert calls (convex/limits.ts,
// CONVEX_CALL_RATE_LIMIT). Mounting it adds the component's own tables; the app tables are unchanged.
import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

const app = defineApp();
app.use(rateLimiter);

export default app;
