"use client";
// When a new call goes live (phone or replay), open its console (from Home, and from a console whose
// call has ended). Calls already in the list when the page loads never trigger it. Incoming calls reuse
// one console tab (window name CONSOLE_TAB), or a separate tab while that one shows a live call. One
// open per call across every LastWell tab (localStorage claim). Browsers block a tab opened without a
// click unless pop-ups are allowed for the site; then the console opens in this tab instead.
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { gateway } from "@/lib/gateway";
import { CONSOLE_TAB, newLiveCall, openTarget } from "@/lib/incoming";

export const INCOMING_POLL_MS = 2000;
const BUSY_KEY = "lastwell:console-tab-live";

/** First tab to claim a call opens it; storage errors (private mode) fall back to opening here. */
export function claimCall(callId: string): boolean {
  try {
    const key = `lastwell:opened:${callId}`;
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

function busyCallId(): string | null {
  try {
    return localStorage.getItem(BUSY_KEY);
  } catch {
    return null;
  }
}

/** The shared console tab records the live call it shows, so incoming calls do not replace it. */
export function useConsoleTabBusy(callId: string, live: boolean): void {
  useEffect(() => {
    if (window.name !== CONSOLE_TAB) return;
    try {
      if (live) localStorage.setItem(BUSY_KEY, callId);
      else if (localStorage.getItem(BUSY_KEY) === callId) localStorage.removeItem(BUSY_KEY);
    } catch {
      // storage unavailable: incoming calls then always reuse the console tab
    }
  }, [callId, live]);
}

export function useIncomingCall(enabled: boolean): void {
  const router = useRouter();
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const check = async () => {
      try {
        const { calls } = await gateway.listCalls();
        if (stopped) return;
        if (known.current === null) {
          known.current = new Set(calls.map((c) => c.id));
          return;
        }
        const next = newLiveCall(calls, known.current);
        for (const c of calls) known.current.add(c.id);
        if (next && claimCall(next.id)) {
          const url = `/console/${next.id}`;
          // No "noopener": with it window.open always returns null and a block could not be detected.
          const tab = window.open(url, openTarget(calls, busyCallId()));
          if (!tab) router.push(url);
        }
      } catch {
        // gateway down: the page's own link badge says so; try again next tick
      }
    };
    void check();
    const t = setInterval(check, INCOMING_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [enabled, router]);
}
