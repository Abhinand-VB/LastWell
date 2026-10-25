"use client";
// W-06: stroke-team board (docs/01 §7, docs/06 §9). One card per alert, legible from 2 m.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AlertSummary } from "@lastwell/core";
import { useBoard } from "@/hooks/useBoard";
import { useNow } from "@/hooks/useNow";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { LevelPill } from "@/components/console/StrokeCard";
import { gateway } from "@/lib/gateway";
import { STATUS_LABEL, sendErrorText } from "@/lib/alerts";
import { bloodThinnerLabel } from "@/lib/consoleText";
import { SIGN_LABEL, mmss, windowCountdown } from "@/lib/format";

export const TREATMENT_FOOTNOTE = "The treating team makes every treatment decision.";

export function BoardView() {
  const { alerts, connection, setAlert } = useBoard();
  const now = useNow(15_000);
  const labels = useCallLabels(alerts);
  return (
    <main className="min-h-screen p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-4">
          <Link href="/" className="text-3xl font-bold tracking-tight text-white">
            LastWell
          </Link>
          <span className="text-2xl text-slate-400">Stroke team board</span>
        </div>
        <ConnectionBadge status={connection} />
      </header>
      {alerts.length === 0 ? (
        <p data-testid="board-empty" className="mt-16 text-center text-2xl text-slate-500">
          No pre-alerts yet. They appear here the moment a dispatcher sends one.
        </p>
      ) : (
        <div className={`mt-6 grid grid-cols-1 gap-6 ${alerts.length === 1 ? "max-w-5xl" : "xl:grid-cols-2"}`}>
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} label={labels[a.callId] || null} now={now} onAlert={setAlert} />
          ))}
        </div>
      )}
    </main>
  );
}

/** Call labels (TEST, replay script id) come from GET /api/calls: AlertSummary carries none. */
function useCallLabels(alerts: AlertSummary[]): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const missing = alerts.some((a) => !(a.callId in labels));
  useEffect(() => {
    if (!missing) return;
    let cancelled = false;
    gateway
      .listCalls()
      .then((res) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const a of alerts) next[a.callId] = "";
        for (const c of res.calls) if (c.label) next[c.id] = c.label;
        setLabels((prev) => ({ ...next, ...Object.fromEntries(Object.entries(prev).filter(([, v]) => v)) }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [missing, alerts]);
  return labels;
}

function fact(a: AlertSummary, kind: string): string | null {
  return a.caseSnapshot.facts.find((f) => f.kind === kind)?.value ?? null;
}

function AlertCard({
  alert,
  label,
  now,
  onAlert,
}: {
  alert: AlertSummary;
  label: string | null;
  now: Date;
  onAlert: (a: AlertSummary) => void;
}) {
  const s = alert.caseSnapshot;
  const age = fact(alert, "age");
  const sex = fact(alert, "sex");
  const thinner = s.facts.find((f) => f.kind === "blood_thinner") ?? null;
  const countdown = windowCountdown(s.lkw?.lkwAt ?? null, now);
  const confirmed = alert.emsConfirmedAt !== null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      onAlert((await gateway.emsConfirm(alert.id, !confirmed)).alert);
    } catch (err) {
      setError(sendErrorText(err).replace(/^Not sent: /, ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      data-testid="alert-card"
      data-alert-id={alert.id}
      className="flex flex-col rounded-3xl bg-slate-900/80 p-7 ring-1 ring-slate-700/60"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <LevelPill level={s.level} />
          <span className="text-2xl font-semibold text-white">
            {[age ? `${age} y` : null, sex].filter(Boolean).join(" · ") || "Age/sex not stated"}
          </span>
          {label && (
            <span data-testid="call-label" className="rounded bg-slate-700 px-2 py-0.5 text-sm font-bold text-slate-200">
              {label}
            </span>
          )}
        </div>
        <span
          data-testid="call-progress"
          className={`rounded-full px-3 py-1 text-base font-semibold ${
            alert.status === "failed" ? "bg-red-500 text-white" : "bg-slate-700 text-slate-100"
          }`}
        >
          Briefing call: {STATUS_LABEL[alert.status]}
        </span>
      </div>

      <div data-testid="countdown" data-kind={countdown.kind} title={s.lkw?.display ?? "LKW unknown"} className="mt-6">
        {countdown.kind === "left" && (
          <p className="text-5xl font-bold text-white">
            {countdown.text} <span className="text-2xl font-medium text-slate-300">left</span>
          </p>
        )}
        {countdown.kind === "passed" && <p className="text-5xl font-bold text-slate-300">Window passed</p>}
        {countdown.kind === "unknown" && <p className="text-5xl font-bold text-amber-300">LKW unknown</p>}
        <p className="mt-1 text-xl text-slate-300">
          4.5 h window from LKW{s.lkw?.lkwAt ? ` ${s.lkw.display.split(" (")[0]}` : ""}
          {s.lkw && (
            <span className="ml-2 text-base text-slate-500">
              “{s.lkw.ref.quote}” {mmss(s.lkw.ref.tMs)}
            </span>
          )}
        </p>
        <p className="mt-1 text-base text-slate-400">{TREATMENT_FOOTNOTE}</p>
      </div>

      <dl className="mt-5 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-xl">
        <dt className="text-slate-400">{bloodThinnerLabel(thinner?.value ?? null)}</dt>
        <dd className="text-white">
          {thinner ? (
            <>
              <span className="font-semibold">{thinner.value}</span>{" "}
              <span className="text-base text-slate-400">
                “{thinner.ref.quote}” {mmss(thinner.ref.tMs)}
              </span>
            </>
          ) : (
            <span className="text-slate-500">Not mentioned</span>
          )}
        </dd>
      </dl>

      <ul className="mt-4 space-y-2" data-testid="board-signs">
        {s.signs.map((sign) => (
          <li key={`${sign.kind}-${sign.ref.utteranceId}`} className="flex items-baseline gap-3 text-xl">
            <span className="w-24 shrink-0 font-semibold text-sky-300">{SIGN_LABEL[sign.kind]}</span>
            <span className="text-amber-100 underline decoration-amber-400/80 decoration-2 underline-offset-4">“{sign.ref.quote}”</span>
            <span className="font-mono text-sm text-slate-500">{mmss(sign.ref.tMs)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
        <span
          data-testid="ems-label"
          className={`rounded-full px-4 py-1.5 text-lg font-bold ${
            confirmed ? "bg-emerald-500 text-slate-950" : "bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/60"
          }`}
        >
          {confirmed ? "Paramedic-confirmed" : "Dispatcher pre-alert"}
        </span>
        <button
          type="button"
          data-testid="ems-toggle"
          disabled={busy}
          onClick={toggle}
          className="rounded-xl px-4 py-2 text-base font-semibold text-slate-200 ring-1 ring-slate-600 hover:bg-slate-800 disabled:opacity-50"
        >
          {confirmed ? "Undo paramedic confirmation" : "Mark paramedic-confirmed"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </article>
  );
}
