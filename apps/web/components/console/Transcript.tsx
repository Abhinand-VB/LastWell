"use client";
// W-02: live transcript (docs/01 §7). Speaker-labelled rows with a mm:ss column, the partial line
// in grey italics, validated quotes underlined in amber.
import { useEffect, useMemo, useRef } from "react";
import type { QuoteRef, Utterance } from "@lastwell/core";
import type { PartialLine } from "@/lib/callState";
import { mmss, quoteSegments, speakerLabel } from "@/lib/format";

export function utteranceDomId(id: string): string {
  return `utt-${id}`;
}

/** Scrolls the transcript to an utterance and flashes it (used by every clickable quote). */
export function flashUtterance(id: string): void {
  const el = document.getElementById(utteranceDomId(id));
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("lw-flash");
  void el.offsetWidth; // restart the animation
  el.classList.add("lw-flash");
}

const SPEAKER_CLS: Record<Utterance["speaker"], string> = {
  caller: "text-sky-300",
  dispatcher: "text-slate-400",
  mixed: "text-violet-300",
};

export function Transcript({
  utterances,
  partials,
  refs,
}: {
  utterances: Utterance[];
  partials: PartialLine[];
  refs: QuoteRef[];
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  const quotesById = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of refs) m.set(r.utteranceId, [...(m.get(r.utteranceId) ?? []), r.quote]);
    return m;
  }, [refs]);

  // Follow the live edge unless the dispatcher scrolled up to read.
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [utterances.length, partials]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-2xl bg-slate-900/60 ring-1 ring-slate-700/60">
      <h2 className="border-b border-slate-700/60 px-6 py-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Live transcript
      </h2>
      <div
        ref={scroller}
        onScroll={onScroll}
        data-testid="transcript"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-4"
      >
        {utterances.length === 0 && partials.length === 0 && (
          <p className="px-2 py-6 text-lg text-slate-500">Waiting for the first words…</p>
        )}
        {utterances.map((u) => (
          <div
            key={u.id}
            id={utteranceDomId(u.id)}
            data-testid="utterance"
            className="grid grid-cols-[4.5rem_7rem_1fr] items-baseline gap-3 rounded-lg px-2 py-2"
          >
            <span className="font-mono text-base text-slate-500 tabular-nums">{mmss(u.tStartMs)}</span>
            <span className={`text-base font-semibold ${SPEAKER_CLS[u.speaker]}`}>{speakerLabel(u.speaker)}</span>
            <p className={`text-xl leading-relaxed ${u.speaker === "dispatcher" ? "text-slate-300" : "text-slate-50"}`}>
              {quoteSegments(u.text, quotesById.get(u.id) ?? []).map((s, i) =>
                s.quoted ? (
                  <mark
                    key={i}
                    data-testid="quote-mark"
                    className="bg-transparent text-amber-100 underline decoration-amber-400 decoration-2 underline-offset-[6px]"
                  >
                    {s.text}
                  </mark>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </p>
          </div>
        ))}
        {partials.map((p) => (
          <div
            key={`partial-${p.speaker}`}
            data-testid="partial"
            className="grid grid-cols-[4.5rem_7rem_1fr] items-baseline gap-3 px-2 py-2"
          >
            <span className="font-mono text-base text-slate-600 tabular-nums">{mmss(p.tStartMs)}</span>
            <span className="text-base font-semibold text-slate-500">{speakerLabel(p.speaker)}</span>
            <p className="text-xl italic leading-relaxed text-slate-500">{p.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
