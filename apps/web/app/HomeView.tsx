"use client";
// W-07 (recent calls, browser-mic entry) and W-10 (replay buttons, docs/05 §13).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { CallListItem } from "@lastwell/core";
import { gateway, GatewayError } from "@/lib/gateway";
import { useConfig } from "@/hooks/useConfig";
import { LevelPill } from "@/components/console/StrokeCard";

const REPLAYS = [
  { id: "B01", title: "Card B — dizzy, double vision (chameleon)" },
  { id: "C01", title: "Card C — diabetic, skipped dinner (look-alike)" },
];

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
  const [calls, setCalls] = useState<CallListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await gateway.listCalls();
      setCalls(res.calls);
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
      router.push(`/console/${callId}`);
    } catch (err) {
      setError(`Replay ${scriptId} failed: ${err instanceof Error ? err.message : "error"}`);
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white">LastWell</h1>
          <p className="mt-1 text-xl text-slate-400">Stroke pre-alerts that start on the 911 call</p>
        </div>
        <nav className="flex gap-3">
          <Link
            href="/board"
            data-testid="open-board"
            className="rounded-xl px-5 py-3 text-lg font-semibold text-slate-100 ring-1 ring-slate-600 hover:bg-slate-800"
          >
            Stroke team board
          </Link>
          {config.featureBrowserMic && (
            <Link
              href="/mic"
              data-testid="start-mic"
              className="rounded-xl bg-sky-600 px-5 py-3 text-lg font-semibold text-white hover:bg-sky-500"
            >
              Start browser-mic call
            </Link>
          )}
        </nav>
      </header>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Replay a scripted call</h2>
        <div className="mt-3 flex flex-wrap gap-4">
          {REPLAYS.map((r) => (
            <button
              key={r.id}
              type="button"
              data-testid={`replay-${r.id}`}
              disabled={busy !== null}
              onClick={() => replay(r.id)}
              className="rounded-2xl bg-slate-900/80 px-6 py-4 text-left ring-1 ring-slate-700 hover:ring-sky-400 disabled:opacity-60"
            >
              <span className="block text-2xl font-bold text-white">{busy === r.id ? "Starting…" : `Replay ${r.id}`}</span>
              <span className="block text-base text-slate-400">{r.title}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Recent calls</h2>
        {error && (
          <p data-testid="home-error" className="mt-3 rounded-lg bg-yellow-300/10 px-4 py-2 text-lg text-yellow-100 ring-1 ring-yellow-300/50">
            {error}
          </p>
        )}
        {calls === null && !error && <p className="mt-4 text-lg text-slate-500">Loading…</p>}
        {calls?.length === 0 && <p className="mt-4 text-lg text-slate-500">No calls yet. Dial the demo number or start a replay.</p>}
        {calls && calls.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-800 rounded-2xl bg-slate-900/60 ring-1 ring-slate-700/60" data-testid="call-list">
            {calls.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/console/${c.id}`}
                  data-testid="call-row"
                  className="grid grid-cols-[6rem_1fr_auto_auto] items-center gap-5 px-6 py-4 hover:bg-slate-800/60"
                >
                  <span className="font-mono text-lg text-slate-400 tabular-nums">{timeOf(c.startedAt, c.timezone)}</span>
                  <span className="text-xl text-white">
                    {c.label && <span className="mr-3 rounded bg-slate-700 px-2 py-0.5 text-base font-bold">{c.label}</span>}
                    {c.mode === "phone" ? (c.callerNumberMasked ?? "Phone call") : c.mode === "browser" ? "Browser mic" : "Replay"}
                  </span>
                  <LevelPill level={c.level} />
                  <span className={`text-base font-semibold ${c.status === "live" ? "text-sky-300" : "text-slate-500"}`}>
                    {c.status === "live" ? "● Live" : c.status === "ended" ? "Ended" : "Failed"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
