// Auto-open the console for an incoming call. Pure; unit-tested.
import type { CallListItem } from "@lastwell/core";

/** Window name of the one console tab that incoming calls reuse. */
export const CONSOLE_TAB = "lastwell-console";

/**
 * The newest live call not in `known` (ids already seen on this page), or null. Phone calls and
 * replays (including dev:fake's automatic ones) count; browser-mic calls do not, since the mic page
 * opens their console itself.
 */
export function newLiveCall(calls: readonly CallListItem[], known: ReadonlySet<string>): CallListItem | null {
  const fresh = calls.filter((c) => c.mode !== "browser" && c.status === "live" && !known.has(c.id));
  if (fresh.length === 0) return null;
  return fresh.reduce((a, b) => (Date.parse(b.startedAt) > Date.parse(a.startedAt) ? b : a));
}

/**
 * Where to open an incoming call: the shared console tab, unless that tab is showing a call that is
 * still live (`busyCallId`), in which case a separate new tab so the live call is never replaced.
 */
export function openTarget(calls: readonly CallListItem[], busyCallId: string | null): string {
  const busy = busyCallId !== null && calls.some((c) => c.id === busyCallId && c.status === "live");
  return busy ? "_blank" : CONSOLE_TAB;
}
