"use client";
import type { QuoteRef } from "@lastwell/core";
import { mmss } from "@/lib/format";
import { flashUtterance } from "./Transcript";

/** A verbatim quote with its timestamp; click → scroll to and flash the utterance. */
export function QuoteButton({ quoteRef, className = "" }: { quoteRef: QuoteRef; className?: string }) {
  return (
    <button
      type="button"
      data-testid="quote"
      onClick={() => flashUtterance(quoteRef.utteranceId)}
      title="Show in transcript"
      className={`group inline-flex items-baseline gap-2 text-left ${className}`}
    >
      <span className="text-lw-evidence underline decoration-lw-evidence-line decoration-2 underline-offset-4 group-hover:decoration-amber-600">
        “{quoteRef.quote}”
      </span>
      <span className="shrink-0 font-mono text-sm text-lw-ink-3 tabular-nums">{mmss(quoteRef.tMs)}</span>
    </button>
  );
}
