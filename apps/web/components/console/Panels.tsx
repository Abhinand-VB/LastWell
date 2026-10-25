"use client";
// W-04: next-question banner, look-alike check, critical facts, latency readout, warning banners.
import type { CaseState } from "@lastwell/core";
import { callSummary, factRows, lookalikeLine, splitLkwDisplay, WARNING_TEXT } from "@/lib/consoleText";
import { useNow } from "@/hooks/useNow";
import { agoText, latency, minutesAgo } from "@/lib/format";
import { QuoteButton } from "./QuoteButton";

const CARD = "rounded-2xl border border-lw-border bg-lw-surface p-6";
const HEADING = "text-sm font-semibold uppercase tracking-widest text-lw-ink-3";

const BANNER = "rounded-2xl border-[1.5px] px-8 py-6";

/**
 * D-55: while the caller is on the line the banner is "Ask next"; once the call has ended there is
 * nothing left to ask, so the same box shows the code-built summary instead.
 */
export function NextQuestionBanner({ state, live }: { state: CaseState | null; live: boolean }) {
  if (!state) return null;
  if (!live) {
    return (
      <section data-testid="call-summary" className={`${BANNER} border-lw-border-strong bg-lw-surface`}>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-lw-ink-3">Summary</h2>
        <p className="mt-2 text-3xl font-semibold leading-snug tracking-tight text-lw-ink">{callSummary(state)}</p>
      </section>
    );
  }
  const q = state.nextQuestion;
  if (!q) return null;
  return (
    <section data-testid="next-question" className={`${BANNER} border-lw-accent-border bg-lw-accent-soft`} aria-live="polite">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-lw-accent-text">Ask next</h2>
      <p className="mt-2 text-4xl font-bold leading-tight tracking-tight text-lw-ink">{q.text}</p>
    </section>
  );
}

export function LookalikePanel({ state }: { state: CaseState | null }) {
  if (!state || state.lookalikes.length === 0) return null;
  return (
    <section data-testid="lookalikes" className={CARD}>
      <h2 className={HEADING}>Look-alike check</h2>
      <ul className="mt-3 space-y-3">
        {state.lookalikes.map((l) => {
          const line = lookalikeLine(l, state);
          return (
            <li key={l.name} data-testid="lookalike" data-resolved={line.resolved} className="text-xl">
              <span className={line.resolved ? "text-emerald-700" : "font-semibold text-amber-800"}>{line.text}</span>
              {l.ref && (
                <div className="mt-1 text-lg">
                  <QuoteButton quoteRef={l.ref} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function FactsPanel({ state }: { state: CaseState | null }) {
  const now = useNow(30_000);
  if (!state) return null;
  const lkw = state.lkw;
  const mins = lkw ? minutesAgo(lkw.lkwAt, now) : null;
  const parts = lkw ? splitLkwDisplay(lkw.display) : null;
  return (
    <section data-testid="facts" className={CARD}>
      <h2 className={HEADING}>Facts</h2>
      <div data-testid="fact-lkw" className="mt-4 rounded-xl bg-lw-subtle px-5 py-4">
        <p className="text-base font-semibold text-lw-ink-2">Last known well</p>
        {lkw && parts ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span
                data-testid="lkw-display"
                title={lkw.display}
                className={
                  !lkw.lkwAt
                    ? "text-xl font-semibold text-lw-ink"
                    : `font-bold tracking-tight text-lw-ink ${parts.clock.length > 9 ? "text-4xl" : "text-5xl"}`
                }
              >
                {parts.clock}
              </span>
              {mins !== null && (
                <span data-testid="lkw-ago" className="text-xl text-lw-ink-2">
                  {agoText(mins)}
                </span>
              )}
            </div>
            {(parts.range || parts.note) && (
              <p className="mt-1 text-base">
                {parts.range && <span className="text-lw-ink-3">{parts.range}</span>}
                {parts.note && <span className="ml-3 font-semibold text-amber-800">{parts.note}</span>}
              </p>
            )}
            <div className="mt-1 text-base">
              <QuoteButton quoteRef={lkw.ref} />
            </div>
          </>
        ) : (
          <p className="text-xl text-lw-ink-3">Not yet heard</p>
        )}
      </div>
      <dl className="mt-2 divide-y divide-lw-border">
        {factRows(state.facts).map((r) => (
          <div key={r.key} data-testid={`fact-${r.key}`} className="grid grid-cols-[8rem_1fr] items-baseline gap-3 py-3">
            <dt className="text-base text-lw-ink-2">{r.label}</dt>
            <dd className="min-w-0">
              <span className="text-xl font-semibold text-lw-ink">{r.value}</span>
              <div className="flex flex-col gap-0.5 text-base">
                {r.refs.map((ref) => (
                  <QuoteButton key={ref.utteranceId + ref.quote} quoteRef={ref} />
                ))}
              </div>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Shown only on the console's debug view (?debug), not during a call. */
export function LatencyReadout({ state }: { state: CaseState | null }) {
  if (!state) return null;
  return (
    <p data-testid="latency" className="font-mono text-sm text-lw-ink-3 tabular-nums">
      fast {latency(state.latency.fastPassMs)} · reason {latency(state.latency.reasonerMs)}
      {state.droppedCount > 0 && ` · ${state.droppedCount} unquoted item${state.droppedCount === 1 ? "" : "s"} dropped`}
    </p>
  );
}

export function WarningBanners({ state }: { state: CaseState | null }) {
  if (!state || state.warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      {state.warnings.map((w) => (
        <div
          key={w}
          data-testid="warning"
          className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-lg font-semibold text-amber-900"
        >
          {WARNING_TEXT[w]}
        </div>
      ))}
    </div>
  );
}
