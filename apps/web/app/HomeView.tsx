"use client";
// W-07 / W-10 (D-56): recent calls with source, duration, level and pre-alert status; scripted
// replays (docs/05 §13) sit in the table footer. Live calls are pinned to the top.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { AlertSummary, CallListItem } from "@lastwell/core";
import { gateway, GatewayError } from "@/lib/gateway";
import { useConfig } from "@/hooks/useConfig";
import { claimCall, useIncomingCall } from "@/hooks/useIncomingCall";
import { useNow } from "@/hooks/useNow";
import { AppNav } from "@/components/AppNav";
import { MicIcon, PhoneIcon, PlayIcon } from "@/components/icons";
import { LevelText } from "@/components/console/StrokeCard";
import { preAlertCell, type CellTone } from "@/lib/alerts";
import { mmss } from "@/lib/format";

const REPLAYS = [
  { id: "A01", kind: "Classic", title: "Father, mixed-up words, weak right hand" },
  { id: "B01", kind: "Chameleon", title: "Wife dizzy, sees double, 'just tired'" },
  { id: "C01", kind: "Look-alike", title: "Diabetic husband, skipped dinner, sweaty and confused" },
  { id: "D01", kind: "Other", title: "Husband with crushing chest pain" },
];

const COLS = "grid grid-cols-[7rem_minmax(0,1fr)_6rem_12rem_14rem_6rem] items-center gap-5 px-6";

const TONE: Record<CellTone, string> = {
  done: "text-emerald-700",
  active: "text-lw-accent-text",
  failed: "text-red-700",
  none: "text-lw-ink-3",
};

/** Wall-clock time in the call's own timezone, not the viewing laptop's. */
function timeOf(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  } catch {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}

export function HomeView() {
  const router = useRouter();
  const { config } = useConfig();
  const now = useNow(1000);
  const [calls, setCalls] = useState<CallListItem[] | null>(null);
  const [alerts, setAlerts] = useState<AlertSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useIncomingCall(true);

  const refresh = useCallback(async () => {
    try {
      const [res, al] = await Promise.all([gateway.listCalls(), gateway.listAlerts(24).catch(() => null)]);
      setCalls(res.calls);
      if (al) setAlerts(al.alerts);
      setError(null);
    } catch (err) {
      setError(err instanceof GatewayError && err.status === 0 ? "Gateway unreachable" : "Could not load calls");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  const replay = async (scriptId: string) => {
    setBusy(scriptId);
    setError(null);
    try {
      const { callId } = await gateway.replay(scriptId);
      claimCall(callId); // this tab opens it; no other tab auto-opens it too
      router.push(`/console/${callId}`);
    } catch (err) {
      setError(`Replay ${scriptId} failed: ${err instanceof Error ? err.message : "error"}`);
      setBusy(null);
    }
  };

  const sorted = [...(calls ?? [])].sort((a, b) => Number(b.status === "live") - Number(a.status === "live"));

  return (
    <main className="min-h-screen bg-lw-page text-lw-ink [color-scheme:light]">
      <AppNav />
      <div className="mx-auto max-w-[1600px] px-7 py-8">
        <h1 className="text-sm font-semibold uppercase tracking-widest text-lw-ink-3">Recent calls</h1>
        {error && (
          <p data-testid="home-error" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-lg text-amber-900">
            {error}
          </p>
        )}

        <div className="mt-3 overflow-hidden rounded-2xl border border-lw-border bg-lw-surface">
          <div className={`${COLS} border-b border-lw-border bg-lw-subtle py-3 text-sm font-medium text-lw-ink-3`}>
            <span>Time</span>
            <span>Call</span>
            <span>Duration</span>
            <span>Stroke level</span>
            <span>Pre-alert</span>
            <span>Status</span>
          </div>

          {calls === null && !error && <p className="px-6 py-5 text-lg text-lw-ink-3">Loading…</p>}
          {calls?.length === 0 && <p className="px-6 py-5 text-lg text-lw-ink-3">No calls yet. Dial the demo number or replay a scripted call below.</p>}
          {sorted.length > 0 && (
            <ul data-testid="call-list" className="divide-y divide-lw-border">
              {sorted.map((c) => {
                const live = c.status === "live";
                const cell = preAlertCell(alerts.filter((a) => a.callId === c.id), live, config.alertDelivery);
                const ms = (c.endedAt ? Date.parse(c.endedAt) : now.getTime()) - Date.parse(c.startedAt);
                return (
                  <li key={c.id}>
                    <Link
                      href={`/console/${c.id}`}
                      data-testid="call-row"
                      className={`${COLS} py-4 hover:bg-lw-subtle ${live ? "bg-lw-accent-soft" : ""}`}
                    >
                      <span className="font-mono text-lg text-lw-ink-2 tabular-nums">{timeOf(c.startedAt, c.timezone)}</span>
                      <span className="flex min-w-0 items-center gap-3 text-xl text-lw-ink">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lw-subtle text-lw-ink-2">
                          {c.mode === "phone" ? <PhoneIcon /> : c.mode === "browser" ? <MicIcon /> : <PlayIcon />}
                        </span>
                        {c.label && <span className="rounded bg-lw-subtle px-2 py-0.5 text-base font-bold text-lw-ink-2 ring-1 ring-lw-border">{c.label}</span>}
                        <span className="truncate">
                          {c.mode === "phone" ? (c.callerNumberMasked ?? "Phone call") : c.mode === "browser" ? "Browser mic" : "Replay"}
                        </span>
                      </span>
                      <span className={`font-mono text-lg tabular-nums ${live ? "text-lw-ink" : "text-lw-ink-2"}`}>{mmss(Math.max(0, ms))}</span>
                      <span>
                        <LevelText level={c.level} />
                      </span>
                      <span data-testid="pre-alert" className={`text-base font-semibold ${TONE[cell.tone]}`}>
                        {cell.text}
                      </span>
                      <span className={`text-base font-semibold ${live ? "text-lw-accent-text" : c.status === "failed" ? "text-red-700" : "text-lw-ink-3"}`}>
                        {live ? "● Live" : c.status === "ended" ? "Ended" : "Failed"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-lw-border bg-lw-subtle px-6 py-3">
            <span className="mr-2 text-sm font-medium text-lw-ink-3">Replay a scripted call</span>
            {REPLAYS.map((r) => (
              <button
                key={r.id}
                type="button"
                data-testid={`replay-${r.id}`}
                title={r.title}
                disabled={busy !== null}
                onClick={() => replay(r.id)}
                className="inline-flex items-center gap-2 rounded-lg bg-lw-surface px-3 py-1.5 text-base ring-1 ring-lw-border hover:ring-lw-accent disabled:opacity-60"
              >
                <PlayIcon size={14} className="text-lw-accent" />
                <span className="font-bold text-lw-ink">{busy === r.id ? "Starting…" : r.id}</span>
                <span className="text-lw-ink-3">{r.kind}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
