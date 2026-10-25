"use client";
// W-03: stroke card (docs/01 §7, docs/03 §3 rendering rule). Level pill, BE-FAST chips, one row per
// validated sign with its verbatim quote. Never "not a stroke": with no signs the headline is
// exactly "No stroke signs heard yet."
import { guardLevel, isLkwEstablished, type CaseState, type Level } from "@lastwell/core";
import { SIGN_LABEL, SIGN_LETTER, SIGN_ORDER, groupSigns } from "@/lib/format";
import { QuoteButton } from "./QuoteButton";

export const NO_SIGNS_HEADLINE = "No stroke signs heard yet.";

/** The console is light; home and board are still dark. */
export type Tone = "dark" | "light";

// The level word sits in its own element (the X-03 smoke test looks for exactly "Likely").
const LEVEL_STYLE: Record<Level, { word: string; suffix: string; cls: Record<Tone, string> }> = {
  none: { word: "None", suffix: "", cls: { dark: "bg-slate-700 text-slate-200", light: "bg-lw-subtle text-lw-ink-2 ring-1 ring-lw-border" } },
  possible: { word: "Possible", suffix: "stroke", cls: { dark: "bg-amber-400 text-slate-950", light: "bg-amber-400 text-slate-950" } },
  likely: { word: "Likely", suffix: "stroke", cls: { dark: "bg-red-500 text-white", light: "bg-lw-danger text-white" } },
};

export function LevelPill({
  level,
  title,
  tone = "dark",
  size = "md",
}: {
  level: Level;
  title?: string;
  tone?: Tone;
  size?: "md" | "sm";
}) {
  const s = LEVEL_STYLE[level];
  return (
    <span
      data-testid="level-pill"
      data-level={level}
      title={title}
      className={`inline-flex items-center gap-1 rounded-full font-bold tracking-wide ${
        size === "md" ? "px-4 py-1.5 text-lg" : "px-2.5 py-0.5 text-sm"
      } ${s.cls[tone]}`}
    >
      <span>{s.word}</span>
      {s.suffix && <span>{s.suffix}</span>}
    </span>
  );
}

const LEVEL_TEXT_CLS: Record<Level, string> = {
  none: "text-lw-ink-3",
  possible: "text-amber-700",
  likely: "text-lw-danger",
};

/** The home list's level: the same words as LevelPill, as plain text without the filled pill (human request). */
export function LevelText({ level }: { level: Level }) {
  const s = LEVEL_STYLE[level];
  return (
    <span data-testid="level-text" data-level={level} className={`text-lg font-bold ${LEVEL_TEXT_CLS[level]}`}>
      {s.word}
      {s.suffix && ` ${s.suffix}`}
    </span>
  );
}

export type ChipState = "on" | "half" | "off";

export function Chip({
  letter,
  label,
  state,
  size = "lg",
  tone = "dark",
}: {
  letter: string;
  label: string;
  state: ChipState;
  size?: "lg" | "sm" | "xs";
  tone?: Tone;
}) {
  const cls =
    tone === "light"
      ? state === "on"
        ? "bg-lw-accent text-white ring-lw-accent"
        : state === "half"
          ? "bg-lw-accent-soft text-lw-accent-text ring-lw-accent ring-2"
          : "bg-lw-subtle text-lw-ink-3 ring-lw-border"
      : state === "on"
        ? "bg-sky-400 text-slate-950 ring-sky-300"
        : state === "half"
          ? "bg-sky-400/10 text-sky-200 ring-sky-400 ring-2 border-dashed"
          : "bg-slate-800 text-slate-500 ring-slate-700";
  return (
    <span
      data-testid={`chip-${letter}`}
      data-state={state}
      title={`${label}${state === "on" ? ": heard" : state === "half" ? ": phrase heard, time not pinned down" : ": not heard"}`}
      className={`flex items-center justify-center font-bold ring-1 ${
        size === "lg"
          ? "h-[3.75rem] w-[3.75rem] rounded-2xl text-2xl"
          : size === "sm"
            ? "h-10 w-10 rounded-lg text-lg"
            : "h-7 w-7 rounded-md text-sm"
      } ${cls}`}
    >
      {letter}
    </span>
  );
}

export function StrokeCard({ state }: { state: CaseState | null }) {
  const signs = state?.signs ?? [];
  const level = state?.level ?? "none";
  const kinds = new Set(signs.map((s) => s.kind));
  const guard = state ? guardLevel(state.signs, state.modelLevel) : null;
  const tooltip = state
    ? `Reasoner said: ${state.modelLevel}. Shown: ${level} (${guard?.reason ?? ""}).${state.summary ? ` ${state.summary}` : ""}`
    : "Waiting for the call state";
  const lkwState: ChipState = !state?.lkw ? "off" : isLkwEstablished(state.lkw) ? "on" : "half";

  return (
    <section data-testid="stroke-card" className="rounded-2xl border border-lw-border bg-lw-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-lw-ink-3">Signs</h2>
        <LevelPill level={level} title={tooltip} tone="light" />
      </div>

      <div className="mt-6 flex gap-3" aria-label="BE-FAST">
        {SIGN_ORDER.map((k) => (
          <Chip key={k} tone="light" letter={SIGN_LETTER[k]} label={SIGN_LABEL[k]} state={kinds.has(k) ? "on" : "off"} />
        ))}
        <Chip tone="light" letter="T" label="Time last known well" state={lkwState} />
      </div>

      {signs.length === 0 ? (
        <p data-testid="no-signs" className="mt-6 text-2xl font-medium text-lw-ink-2">
          {NO_SIGNS_HEADLINE}
        </p>
      ) : (
        <ul className="mt-6 space-y-4" data-testid="sign-rows">
          {groupSigns(signs).map((g) => (
            <li key={g.kind} data-kind={g.kind} className="flex items-baseline gap-3 text-xl">
              <span className="w-24 shrink-0 font-semibold text-lw-accent-text">{SIGN_LABEL[g.kind]}</span>
              <span className="flex min-w-0 flex-col gap-1.5">
                {g.refs.map((ref) => (
                  <QuoteButton key={ref.utteranceId + ref.quote} quoteRef={ref} />
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
