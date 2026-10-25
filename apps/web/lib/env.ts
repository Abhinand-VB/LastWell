// Server-side environment for the web app (docs/01 §8). Imported only by route handlers;
// the browser bundle sees NEXT_PUBLIC_* variables only and never INTERNAL_API_KEY.
import { z } from "zod/v4";

const ServerEnv = z.object({
  INTERNAL_API_KEY: z.string().min(1),
  GATEWAY_URL: z.url(),
});
export type ServerEnv = z.infer<typeof ServerEnv>;

let cached: ServerEnv | null = null;

/** Parsed lazily so `next build` works without the variables; the first request fails fast and readably. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = ServerEnv.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`web: missing or invalid environment variable(s): ${names} (see .env.example)`);
  }
  cached = { ...parsed.data, GATEWAY_URL: parsed.data.GATEWAY_URL.replace(/\/+$/, "") };
  return cached;
}
