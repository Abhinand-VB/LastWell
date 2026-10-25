// Proposed D-57: optional Convex-backed helpers for the alert service. Each one is null unless its
// flag is on (CONVEX_AUDIO_STORAGE, CONVEX_CALL_RATE_LIMIT) and the store is Convex; with null the
// alert service behaves exactly as before.

/** Sonic briefing bytes in Convex file storage (convex/audio.ts). */
export interface BriefingAudioStore {
  saveBriefingAudio(alertId: string, audio: Buffer): Promise<void>;
  /** null when nothing is stored for this alert. */
  loadBriefingAudio(alertId: string): Promise<Buffer | null>;
}

/** Per-number outbound alert call limit (convex/limits.ts, @convex-dev/rate-limiter). */
export interface CallLimiter {
  takeAlertCall(phone: string): Promise<{ ok: true } | { ok: false; retryAfterMs: number }>;
}

/** Shown in the 409 (code rate_limited). Must not contain "allow": the web maps that word to the D-35 allowlist text. */
export const CALL_LIMIT_TEXT = "3 alert calls per number per 10 minutes";

/** Convex round trips the alert path waits for at most; past this the helper is skipped (logged). */
export const EXTRAS_TIMEOUT_MS = 3_000;

export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
