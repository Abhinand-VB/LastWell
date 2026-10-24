"use client";
// W-04: next-question banner, look-alike check, critical facts, latency readout, warning banners.
import type { CaseState, Fact, FactKind } from "@lastwell/core";
import { lookalikeLine, WARNING_TEXT } from "@/lib/consoleText";
import { useNow } from "@/hooks/useNow";
import { agoText, latency, minutesAgo } from "@/lib/format";
import { QuoteButton } from "./QuoteButton";

export function NextQuestionBanner({ state }: { state: CaseState | null }) {
  const q = state?.nextQuestion;
  if (!q) return null;
  return (
    <section
      data-testid="next-question"
      className="rounded-2xl bg-sky-950/70 px-6 py-5 ring-2 ring-sky-400/70"
      aria-live="polite"
    >
      <h2 className="text-sm font-semibold uppercase tracking-widest text-sky-300">Next question</h2>
      <p className="mt-2 text-3xl font-semibold leading-snug text-white">{q.text}</p>
    </section>
  );
}

export function LookalikePanel({ state }: { state: CaseState | null }) {
  if (!state || state.lookalikes.length === 0) return null;
  return (
    <section data-testid="lookalikes" className="rounded-2xl bg-slate-900/80 p-6 ring-1 ring-slate-700/60">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Look-alike check</h2>
      <ul className="mt-3 space-y-3">
        {state.lookalikes.map((l) => {
          const line = lookalikeLine(l, state);
          return (
            <li key={l.name} data-testid="lookalike" data-resolved={line.resolved} className="text-xl">
              <span className={line.resolved ? "text-emerald-300" : "text-amber-200"}>{line.text}</span>
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

const FACT_ROWS: { kind: FactKind; label: string }[] = [
  { kind: "blood_thinner", label: "Blood thinner" },
  { kind: "age", label: "Age" },
  { kind: "sex", label: "Sex" },
  { kind: "diabetes", label: "Diabetes" },
  { kind: "seizure_history", label: "Seizure history" },
  { kind: "medication", label: "Medications" },
  { kind: "address", label: "Address" },
];

function FactRow({ label, fact }: { label: string; fact: Fact }) {
  return (
    <div data-testid={`fact-${fact.kind}`} className="grid grid-cols-[9.5rem_1fr] items-baseline gap-3 py-1.5">
      <dt className="text-base text-slate-400">{label}</dt>
      <dd>
        <span className="text-xl font-semibold text-white">{fact.value}</span>
        <div className="text-base">
          <QuoteButton quoteRef={fact.ref} />
        </div>
      </dd>
    </div>
  );
}

export function FactsPanel({ state }: { state: CaseState | null }) {
  const now = useNow(30_000);
  if (!state) return null;
  const lkw = state.lkw;
  const mins = lkw ? minutesAgo(lkw.lkwAt, now) : null;
  const rows = FACT_ROWS.flatMap(({ kind, label }) =>
    state.facts.filter((f) => f.kind === kind).map((f) => ({ label, fact: f })),
  );
  return (
    <section data-testid="facts" className="rounded-2xl bg-slate-900/80 p-6 ring-1 ring-slate-700/60">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Critical facts</h2>
      <dl className="mt-3 divide-y divide-slate-800">
        <div data-testid="fact-lkw" className="grid grid-cols-[9.5rem_1fr] items-baseline gap-3 py-1.5">
          <dt className="text-base text-slate-400">Last known well</dt>
          <dd>
            {lkw ? (
              <>
                <span data-testid="lkw-display" className="text-2xl font-bold text-white">
                  {lkw.display}
                </span>
                {mins !== null && (
                  <span data-testid="lkw-ago" className="ml-3 text-lg text-slate-300">
                    {agoText(mins)}
                  </span>
                )}
                <div className="text-base">
                  <QuoteButton quoteRef={lkw.ref} />
                </div>
              </>
            ) : (
              <span className="text-xl text-slate-500">Not yet heard</span>
            )}
          </dd>
        </div>
        {rows.map((r) => (
          <FactRow key={`${r.fact.kind}-${r.fact.value}`} label={r.label} fact={r.fact} />
        ))}
      </dl>
    </section>
  );
}

export function LatencyReadout({ state }: { state: CaseState | null }) {
  if (!state) return null;
  return (
    <p data-testid="latency" className="font-mono text-sm text-slate-500 tabular-nums">
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
          className="rounded-xl bg-yellow-300/15 px-5 py-3 text-lg font-semibold text-yellow-100 ring-1 ring-yellow-300/60"
        >
          {WARNING_TEXT[w]}
        </div>
      ))}
    </div>
  );
}
