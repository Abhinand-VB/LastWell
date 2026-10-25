"use client";
// W-06: pre-alert board for the stroke team (docs/01 §7, docs/06 §9). One card per alert, legible from 2 m. Light theme (D-56).
import { useEffect, useState } from "react";
import { isLkwEstablished, type AlertSummary, type Level } from "@lastwell/core";
import { useBoard } from "@/hooks/useBoard";
import { useConfig } from "@/hooks/useConfig";
import { useNow } from "@/hooks/useNow";
import { AppNav, LinkStatus } from "@/components/AppNav";
import { Chip, LevelPill } from "@/components/console/StrokeCard";
import { gateway } from "@/lib/gateway";
import type { WebConfig } from "@/lib/config";
import { sendErrorText, statusLabel, statusSteps, stepIndex } from "@/lib/alerts";
import { bloodThinnerLabel } from "@/lib/consoleText";
import {
  SIGN_LABEL,
  SIGN_LETTER,
  SIGN_ORDER,
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

export function BoardView() {
  const { alerts, connection, setAlert } = useBoard();
  const { config } = useConfig();
  const now = useNow(15_000);
  const labels = useCallLabels(alerts);
  return (
    <main className="min-h-screen bg-lw-page text-lw-ink [color-scheme:light]">
      <AppNav>
        <LinkStatus status={connection} />
        <span data-testid="board-count" className="text-base text-lw-ink-2">
          {alerts.length === 1 ? "1 pre-alert" : `${alerts.length} pre-alerts`}
        </span>
      </AppNav>
      <div className="px-7 py-6">
        {alerts.length === 0 ? (
          <p data-testid="board-empty" className="mt-16 text-center text-2xl text-lw-ink-3">
            No pre-alerts yet. They appear here the moment a dispatcher sends one.
          </p>
        ) : (
          <div className={`grid grid-cols-1 gap-6 ${alerts.length === 1 ? "max-w-4xl" : "xl:grid-cols-2 2xl:grid-cols-3"}`}>
            {alerts.map((a) => (
              <AlertCard key={a.id} alert={a} label={labels[a.callId] || null} now={now} config={config} onAlert={setAlert} />
            ))}
          </div>
        )}
      </div>
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
  config,
  onAlert,
}: {
  alert: AlertSummary;
  label: string | null;
  now: Date;
  config: WebConfig;
  onAlert: (a: AlertSummary) => void;
}) {
  const s = alert.caseSnapshot;
  const age = fact(alert, "age");
  const sex = fact(alert, "sex");
  const thinner = s.facts.find((f) => f.kind === "blood_thinner") ?? null;
  const kinds = new Set(s.signs.map((sign) => sign.kind));
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
      className={`flex flex-col gap-5 rounded-3xl border border-l-8 border-lw-border bg-lw-surface p-7 ${LEVEL_ACCENT[s.level]}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <LevelPill level={s.level} tone="light" />
        <span className="text-2xl font-semibold text-lw-ink">
          {[age ? `${age} y` : null, sex].filter(Boolean).join(" · ") || "Age/sex not stated"}
        </span>
        {label && (
          <span data-testid="call-label" className="rounded bg-lw-subtle px-2 py-0.5 text-sm font-bold text-lw-ink-2 ring-1 ring-lw-border">
            {label}
          </span>
        )}
      </div>
      <div className="flex gap-1.5" aria-label="BE-FAST">
        {SIGN_ORDER.map((k) => (
          <Chip key={k} size="sm" tone="light" letter={SIGN_LETTER[k]} label={SIGN_LABEL[k]} state={kinds.has(k) ? "on" : "off"} />
        ))}
        <Chip size="sm" tone="light" letter="T" label="Time last known well" state={!s.lkw ? "off" : isLkwEstablished(s.lkw) ? "on" : "half"} />
      </div>

      <WindowPanel alert={alert} now={now} timeZone={config.callTimezone} />

      <dl className="grid grid-cols-[9rem_1fr] gap-x-4 text-xl">
        <dt className="text-lw-ink-2">{bloodThinnerLabel(thinner?.value ?? null)}</dt>
        <dd>
          {thinner ? (
            <>
              <span className="font-semibold text-lw-ink">{thinner.value}</span>{" "}
              <span className="text-base text-lw-ink-2">
                “{thinner.ref.quote}” {mmss(thinner.ref.tMs)}
              </span>
            </>
          ) : (
            <span className="text-lw-ink-3">Not mentioned</span>
          )}
        </dd>
      </dl>

      <ul className="space-y-3" data-testid="board-signs">
        {groupSigns(s.signs).map((g) => (
          <li key={g.kind} data-kind={g.kind} className="flex items-baseline gap-3 text-xl">
            <span className="w-24 shrink-0 font-semibold text-lw-accent-text">{SIGN_LABEL[g.kind]}</span>
            <span className="flex flex-col gap-1">
              {g.refs.map((ref) => (
                <span key={ref.utteranceId + ref.quote}>
                  <span className={QUOTE}>“{ref.quote}”</span>{" "}
                  <span className="font-mono text-sm text-lw-ink-3">{mmss(ref.tMs)}</span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>

      <BriefingTracker alert={alert} config={config} />

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <span
          data-testid="ems-label"
          className={`rounded-full px-4 py-1.5 text-lg font-bold ${
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
          className="rounded-xl px-4 py-2 text-base font-semibold text-lw-ink-2 ring-1 ring-lw-border-strong hover:bg-lw-subtle disabled:opacity-50"
        >
          {confirmed ? "Undo paramedic confirmation" : "Mark paramedic-confirmed"}
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </article>
  );
}

/** Countdown to the end of the 4.5 h window from LKW, with a bar of the share still left. */
function WindowPanel({ alert, now, timeZone }: { alert: AlertSummary; now: Date; timeZone: string }) {
  const lkw = alert.caseSnapshot.lkw;
  const countdown = windowCountdown(lkw?.lkwAt ?? null, now);
  const bar = windowBar(countdown);
  return (
    <div data-testid="countdown" data-kind={countdown.kind} title={lkw?.display ?? "LKW unknown"} className="rounded-2xl bg-lw-subtle p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {countdown.kind === "left" && (
          <p className={`text-5xl font-bold ${URGENCY_TEXT[bar.urgency]}`}>
            {countdown.text} <span className="text-2xl font-medium text-lw-ink-2">left</span>
          </p>
        )}
        {countdown.kind === "passed" && <p className="text-3xl font-bold text-lw-ink-3">Window passed</p>}
        {countdown.kind === "unknown" && <p className="text-3xl font-bold text-amber-700">LKW unknown</p>}
        {lkw?.lkwAt && (
          <p className="text-lg text-lw-ink-2">
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
          className="mt-4 h-3 overflow-hidden rounded-full bg-lw-border"
        >
          <div className={`h-full rounded-full ${URGENCY_BAR[bar.urgency]}`} style={{ width: `${bar.remaining * 100}%` }} />
        </div>
      )}
      <p className="mt-3 text-lg text-lw-ink-2">
        LKW{lkw?.lkwAt ? ` ${lkw.display.split(" (")[0]}` : " unknown"}
        {lkw && (
          <span className="ml-2 text-base text-lw-ink-3">
            “{lkw.ref.quote}” {mmss(lkw.ref.tMs)}
          </span>
        )}
      </p>
      <p className="mt-1 text-base text-lw-ink-3">{TREATMENT_FOOTNOTE}</p>
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
        <h3 className="text-sm font-semibold uppercase tracking-widest text-lw-ink-3">
          {delivery === "local" ? "Briefing" : "Briefing call"}
        </h3>
        <span className={`text-base font-semibold ${failed ? "text-red-700" : "text-lw-ink"}`}>{statusLabel(alert.status, delivery)}</span>
      </div>
      {failed ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-base text-red-800 ring-1 ring-red-300">
          {alert.lastError ?? "The briefing call failed."}
        </p>
      ) : (
        <ol className="mt-2 flex gap-1.5">
          {steps.map((step, i) => (
            <li key={step} className="flex-1">
              <div className={`h-2 rounded-full ${i <= at ? "bg-lw-accent" : "bg-lw-border"}`} />
              <div className={`mt-1 text-center text-xs ${i === at ? "font-semibold text-lw-accent-text" : i < at ? "text-lw-accent-text" : "text-lw-ink-3"}`}>
                {statusLabel(step, delivery)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
