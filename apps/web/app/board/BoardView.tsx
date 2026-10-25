"use client";
// W-06: pre-alert board for the stroke team (docs/01 §7, docs/06 §9). One card per alert, legible from 2 m. Light theme (D-56).
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import type { AlertSummary, CallListItem, Level } from "@lastwell/core";
import { useBoard } from "@/hooks/useBoard";
import { useConfig } from "@/hooks/useConfig";
import { useNow } from "@/hooks/useNow";
import type { ConnectionStatus } from "@/hooks/useCall";
import { AppNav, LinkStatus } from "@/components/AppNav";
import { LevelPill } from "@/components/console/StrokeCard";
import { gateway } from "@/lib/gateway";
import type { WebConfig } from "@/lib/config";
import { sendErrorText, statusLabel, statusSteps, stepIndex } from "@/lib/alerts";
import { BOARD_LIVE } from "@/lib/boardLive";
import { bloodThinnerLabel } from "@/lib/consoleText";
import {
  SIGN_LABEL,
  clockTime,
  groupSigns,
  mmss,
  windowBar,
  windowCountdown,
  windowEndText,
  type Urgency,
} from "@/lib/format";

export const TREATMENT_FOOTNOTE = "The treating team makes every treatment decision.";

const LEVEL_ACCENT: Record<Level, string> = {
  none: "border-l-lw-border-strong",
  possible: "border-l-amber-400",
  likely: "border-l-lw-danger",
};

const URGENCY_TEXT: Record<Urgency, string> = { ok: "text-emerald-700", soon: "text-amber-700", urgent: "text-red-700" };
const URGENCY_BAR: Record<Urgency, string> = { ok: "bg-emerald-500", soon: "bg-amber-500", urgent: "bg-lw-danger" };
const QUOTE = "text-lw-evidence underline decoration-lw-evidence-line decoration-2 underline-offset-4";

// Proposed D-57: loaded only with NEXT_PUBLIC_BOARD_LIVE=convex, so the default board never loads the Convex client.
const ConvexBoardView = dynamic(() => import("./ConvexBoardView").then((m) => m.ConvexBoardView), { ssr: false });

export function BoardView() {
  return BOARD_LIVE === "convex" ? <ConvexBoardView /> : <WsBoardView />;
}

/** Default: gateway WebSocket + polling (useBoard); call time, number and label from GET /api/calls. */
function WsBoardView() {
  const { alerts, connection, setAlert } = useBoard();
  return <BoardLayout alerts={alerts} connection={connection} onAlert={setAlert} />;
}

export function BoardLayout({
  alerts,
  labels,
  connection,
  onAlert,
  indicator,
  evidenceHref,
}: {
  alerts: AlertSummary[];
  /** Proposed D-57, Convex mode: labels from the Convex query; otherwise the call list's label is used. */
  labels?: Record<string, string>;
  connection: ConnectionStatus;
  onAlert: (a: AlertSummary) => void;
  /** Proposed D-57, Convex mode only: extra items in the nav bar ("live: Convex", Export history). */
  indicator?: ReactNode;
  /** Proposed D-57, Convex mode only: link each card to its live evidence page. */
  evidenceHref?: (a: AlertSummary) => string;
}) {
  const setAlert = onAlert;
  const { config } = useConfig();
  const now = useNow(15_000);
  const calls = useCalls(alerts);
  return (
    <main className="min-h-screen bg-lw-page text-lw-ink [color-scheme:light]">
      <AppNav>
        {indicator}
        <LinkStatus status={connection} />
        <span data-testid="board-count" className="text-base text-lw-ink-2">
          {alerts.length === 1 ? "1 pre-alert" : `${alerts.length} pre-alerts`}
        </span>
      </AppNav>
      <div className="px-7 py-5">
        {alerts.length === 0 ? (
          <p data-testid="board-empty" className="mt-16 text-center text-2xl text-lw-ink-3">
            No pre-alerts yet. They appear here the moment a dispatcher sends one.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {alerts.map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                call={calls[a.callId] ?? null}
                label={labels?.[a.callId] || calls[a.callId]?.label || null}
                now={now}
                config={config}
                onAlert={setAlert}
                evidenceHref={evidenceHref?.(a)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

/**
 * Call time, caller number and label (TEST, replay script id) come from GET /api/calls: AlertSummary
 * carries none. A call the list no longer has maps to null (the tile then shows no call line).
 */
function useCalls(alerts: AlertSummary[]): Record<string, CallListItem | null> {
  const [calls, setCalls] = useState<Record<string, CallListItem | null>>({});
  const missing = alerts.some((a) => !(a.callId in calls));
  useEffect(() => {
    if (!missing) return;
    let cancelled = false;
    gateway
      .listCalls()
      .then((res) => {
        if (cancelled) return;
        const next: Record<string, CallListItem | null> = {};
        for (const a of alerts) next[a.callId] = null;
        for (const c of res.calls) next[c.id] = c;
        setCalls((prev) => ({ ...next, ...Object.fromEntries(Object.entries(prev).filter(([, v]) => v !== null)) }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [missing, alerts]);
  return calls;
}

/** The caller's number as the gateway masks it; replays and mic calls have none. */
function callerText(c: CallListItem): string {
  if (c.mode === "replay") return "Replay";
  if (c.mode === "browser") return "Browser mic";
  return c.callerNumberMasked ?? "Number withheld";
}

function fact(a: AlertSummary, kind: string): string | null {
  return a.caseSnapshot.facts.find((f) => f.kind === kind)?.value ?? null;
}

function AlertCard({
  alert,
  call,
  label,
  now,
  config,
  onAlert,
  evidenceHref,
}: {
  alert: AlertSummary;
  call: CallListItem | null;
  label: string | null;
  now: Date;
  config: WebConfig;
  onAlert: (a: AlertSummary) => void;
  evidenceHref?: string;
}) {
  const s = alert.caseSnapshot;
  const age = fact(alert, "age");
  const sex = fact(alert, "sex");
  const thinner = s.facts.find((f) => f.kind === "blood_thinner") ?? null;
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
      className={`grid grid-cols-1 items-start gap-x-6 gap-y-3 rounded-2xl border border-l-4 border-lw-border bg-lw-surface px-5 py-4 lg:grid-cols-[15rem_17rem_minmax(0,1fr)_15rem] ${LEVEL_ACCENT[s.level]}`}
    >
      {/* Who and when */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <LevelPill level={s.level} tone="light" size="sm" />
          {label && (
            <span data-testid="call-label" className="rounded bg-lw-subtle px-2 py-0.5 text-sm font-bold text-lw-ink-2 ring-1 ring-lw-border">
              {label}
            </span>
          )}
        </div>
        <span className="text-base font-semibold text-lw-ink">
          {[age ? `${age} y` : null, sex].filter(Boolean).join(" · ") || "Age/sex not stated"}
        </span>
        {call && (
          <p data-testid="call-meta" className="text-sm text-lw-ink-2">
            Call <span className="font-mono tabular-nums text-lw-ink">{clockTime(call.startedAt, call.timezone)}</span>
            {" · "}
            <span className="font-mono tabular-nums text-lw-ink">{callerText(call)}</span>
          </p>
        )}
      </div>

      <WindowPanel alert={alert} now={now} timeZone={config.callTimezone} />

      {/* What was heard */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 text-sm">
          <dt className="text-lw-ink-2">{bloodThinnerLabel(thinner?.value ?? null)}</dt>
          <dd>
            {thinner ? (
              <>
                <span className="font-semibold text-lw-ink">{thinner.value}</span>{" "}
                <span className="text-xs text-lw-ink-2">
                  “{thinner.ref.quote}” {mmss(thinner.ref.tMs)}
                </span>
              </>
            ) : (
              <span className="text-lw-ink-3">Not mentioned</span>
            )}
          </dd>
        </dl>

        <ul className="space-y-1.5" data-testid="board-signs">
          {groupSigns(s.signs).map((g) => (
            <li key={g.kind} data-kind={g.kind} className="flex items-baseline gap-3 text-sm">
              <span className="w-[6.5rem] shrink-0 font-semibold text-lw-accent-text">{SIGN_LABEL[g.kind]}</span>
              <span className="flex flex-col gap-0.5">
                {g.refs.map((ref) => (
                  <span key={ref.utteranceId + ref.quote}>
                    <span className={QUOTE}>“{ref.quote}”</span>{" "}
                    <span className="font-mono text-xs text-lw-ink-3">{mmss(ref.tMs)}</span>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Where the pre-alert stands */}
      <div className="flex flex-col gap-2.5">
        <BriefingTracker alert={alert} config={config} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            data-testid="ems-label"
            className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${
              confirmed ? "bg-emerald-600 text-white" : "bg-amber-50 text-amber-900 ring-1 ring-amber-300"
            }`}
          >
            {confirmed ? "Paramedic-confirmed" : "Dispatcher pre-alert"}
          </span>
          <button
            type="button"
            data-testid="ems-toggle"
            disabled={busy}
            onClick={toggle}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-lw-ink-2 ring-1 ring-lw-border-strong hover:bg-lw-subtle disabled:opacity-50"
          >
            {confirmed ? "Undo paramedic confirmation" : "Mark paramedic-confirmed"}
          </button>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {evidenceHref && (
          <Link data-testid="evidence-link" href={evidenceHref} className="self-start text-sm font-semibold text-lw-accent-text underline underline-offset-4">
            Live evidence →
          </Link>
        )}
      </div>
    </article>
  );
}

/** Countdown to the end of the 4.5 h window from LKW, with a bar of the share still left. */
function WindowPanel({ alert, now, timeZone }: { alert: AlertSummary; now: Date; timeZone: string }) {
  const lkw = alert.caseSnapshot.lkw;
  const countdown = windowCountdown(lkw?.lkwAt ?? null, now);
  const bar = windowBar(countdown);
  return (
    <div data-testid="countdown" data-kind={countdown.kind} title={lkw?.display ?? "LKW unknown"} className="rounded-xl bg-lw-subtle p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {countdown.kind === "left" && (
          <p className={`text-2xl font-bold ${URGENCY_TEXT[bar.urgency]}`}>
            {countdown.text} <span className="text-sm font-medium text-lw-ink-2">left</span>
          </p>
        )}
        {countdown.kind === "passed" && <p className="text-lg font-bold text-lw-ink-3">Window passed</p>}
        {countdown.kind === "unknown" && <p className="text-lg font-bold text-amber-700">LKW unknown</p>}
        {lkw?.lkwAt && (
          <p className="text-xs text-lw-ink-2">
            {countdown.kind === "passed" ? "closed" : "closes"} {windowEndText(lkw.lkwAt, timeZone)}
          </p>
        )}
      </div>
      {lkw?.lkwAt && (
        <div
          data-testid="window-bar"
          role="meter"
          aria-label="Share of the 4.5 h window left"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(bar.remaining * 100)}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-lw-border"
        >
          <div className={`h-full rounded-full ${URGENCY_BAR[bar.urgency]}`} style={{ width: `${bar.remaining * 100}%` }} />
        </div>
      )}
      <p className="mt-2 text-sm text-lw-ink-2">
        LKW{lkw?.lkwAt ? ` ${lkw.display.split(" (")[0]}` : " unknown"}
        {lkw && (
          <span className="ml-2 text-xs text-lw-ink-3">
            “{lkw.ref.quote}” {mmss(lkw.ref.tMs)}
          </span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-lw-ink-3">{TREATMENT_FOOTNOTE}</p>
    </div>
  );
}

/** The briefing call as steps (calling → … → completed), the same strip the console shows. */
function BriefingTracker({ alert, config }: { alert: AlertSummary; config: WebConfig }) {
  const delivery = config.alertDelivery;
  const steps = statusSteps(config.featureQa, delivery);
  const at = stepIndex(alert.status, steps);
  const failed = alert.status === "failed";
  return (
    <section data-testid="call-progress" data-status={alert.status}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-lw-ink-3">
          {delivery === "local" ? "Briefing" : "Briefing call"}
        </h3>
        <span className={`text-xs font-semibold ${failed ? "text-red-700" : "text-lw-ink"}`}>{statusLabel(alert.status, delivery)}</span>
      </div>
      {failed ? (
        <p className="mt-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-sm text-red-800 ring-1 ring-red-300">
          {alert.lastError ?? "The briefing call failed."}
        </p>
      ) : (
        <ol className="mt-1.5 flex gap-1">
          {steps.map((step, i) => (
            <li key={step} className="flex-1">
              <div className={`h-1.5 rounded-full ${i <= at ? "bg-lw-accent" : "bg-lw-border"}`} />
              <div className={`mt-0.5 text-center text-[11px] ${i === at ? "font-semibold text-lw-accent-text" : i < at ? "text-lw-accent-text" : "text-lw-ink-3"}`}>
                {statusLabel(step, delivery)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
