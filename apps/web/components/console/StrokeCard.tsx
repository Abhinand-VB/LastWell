"use client";
// W-03: stroke card (docs/01 §7, docs/03 §3 rendering rule). Level pill, BE-FAST chips, one row per
// validated sign with its verbatim quote. Never "not a stroke": with no signs the headline is
// exactly "No stroke signs heard yet."
import { guardLevel, isLkwEstablished, type CaseState, type Level, type SignKind } from "@lastwell/core";
import { SIGN_LABEL, SIGN_LETTER, SIGN_ORDER } from "@/lib/format";
import { QuoteButton } from "./QuoteButton";

export const NO_SIGNS_HEADLINE = "No stroke signs heard yet.";

// The level word sits in its own element (the X-03 smoke test looks for exactly "Likely").
const LEVEL_STYLE: Record<Level, { word: string; suffix: string; cls: string }> = {
  none: { word: "None", suffix: "", cls: "bg-slate-700 text-slate-200" },
  possible: { word: "Possible", suffix: "stroke", cls: "bg-amber-400 text-slate-950" },
  likely: { word: "Likely", suffix: "stroke", cls: "bg-red-500 text-white" },
};

export function LevelPill({ level, title }: { level: Level; title?: string }) {
  const s = LEVEL_STYLE[level];
  return (
    <span
      data-testid="level-pill"
      data-level={level}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-lg font-bold tracking-wide ${s.cls}`}
    >
      <span>{s.word}</span>
      {s.suffix && <span>{s.suffix}</span>}
    </span>
  );
}

type ChipState = "on" | "half" | "off";

function Chip({ letter, label, state }: { letter: string; label: string; state: ChipState }) {
  const cls =
    state === "on"
      ? "bg-sky-400 text-slate-950 ring-sky-300"
      : state === "half"
        ? "bg-sky-400/10 text-sky-200 ring-sky-400 ring-2 border-dashed"
        : "bg-slate-800 text-slate-500 ring-slate-700";
  return (
    <span
      data-testid={`chip-${letter}`}
      data-state={state}
      title={`${label}${state === "on" ? ": heard" : state === "half" ? ": phrase heard, time not pinned down" : ": not heard"}`}
      className={`flex h-14 w-14 items-center justify-center rounded-xl text-2xl font-bold ring-1 ${cls}`}
    >
      {letter}
    </span>
  );
}

export function StrokeCard({ state }: { state: CaseState | null }) {
  const signs = state?.signs ?? [];
  const level = state?.level ?? "none";
  const kinds = new Set<SignKind>(signs.map((s) => s.kind));
  const guard = state ? guardLevel(state.signs, state.modelLevel) : null;
  const tooltip = state
    ? `Reasoner said: ${state.modelLevel}. Shown: ${level} (${guard?.reason ?? ""}).${state.summary ? ` ${state.summary}` : ""}`
    : "Waiting for the call state";
  const lkwState: ChipState = !state?.lkw ? "off" : isLkwEstablished(state.lkw) ? "on" : "half";

  return (
    <section data-testid="stroke-card" className="rounded-2xl bg-slate-900/80 p-6 ring-1 ring-slate-700/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Stroke check</h2>
        <LevelPill level={level} title={tooltip} />
      </div>

      <div className="mt-5 flex gap-2.5" aria-label="BE-FAST">
        {SIGN_ORDER.map((k) => (
          <Chip key={k} letter={SIGN_LETTER[k]} label={SIGN_LABEL[k]} state={kinds.has(k) ? "on" : "off"} />
        ))}
        <Chip letter="T" label="Time last known well" state={lkwState} />
      </div>

      {signs.length === 0 ? (
        <p data-testid="no-signs" className="mt-6 text-2xl font-medium text-slate-300">
          {NO_SIGNS_HEADLINE}
        </p>
      ) : (
        <ul className="mt-5 space-y-3" data-testid="sign-rows">
          {signs.map((s) => (
            <li key={`${s.kind}-${s.ref.utteranceId}`} className="flex items-baseline gap-3 text-xl">
              <span className="w-24 shrink-0 font-semibold text-sky-300">{SIGN_LABEL[s.kind]}</span>
              <QuoteButton quoteRef={s.ref} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
