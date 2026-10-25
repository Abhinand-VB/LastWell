// Dispatcher note and override on approve. The note (≤ 200 chars) is spoken verbatim after the
// briefing's facts as "The dispatcher adds: …" (no model rewriting). Approving below `possible` needs
// an explicit `override: true` (without it the 409 `no_signs` stays), and the briefing then opens with
// OVERRIDE_LINE instead of the usual opening. On the Q&A, the note is one more dispatcher utterance
// the model may quote; an answer whose evidence is only the note is attributed to the dispatcher.
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { validateQuote, type Level, type QaOutput, type QuoteRef, type Utterance } from "@lastwell/core";
import type { QaFinal } from "./qaAnswer.js";

export const NOTE_MAX = 200;

export const ApproveExtras = z.object({
  note: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length <= NOTE_MAX, `note: at most ${NOTE_MAX} characters`)
    .optional(),
  override: z.boolean().optional(),
});

/** The composer's fixed first sentence (packages/core/src/briefing/compose.ts). */
const OPENING = "Stroke pre-alert from nine one one, approved by the dispatcher.";
export const OVERRIDE_LINE = "Dispatcher override: LastWell has not flagged stroke signs on this call; the dispatcher is sending this pre-alert on their own judgment.";
const CLOSE = "Not yet confirmed by paramedics.";

export const belowPossible = (level: Level): boolean => level === "none";

/** The composed briefing with the override opening (below `possible`) and the note before the close. */
export function withDispatcherInput(text: string, level: Level, note: string | null): string {
  let out = belowPossible(level) ? (text.startsWith(OPENING) ? `${OVERRIDE_LINE}${text.slice(OPENING.length)}` : `${OVERRIDE_LINE} ${text}`) : text;
  if (note) {
    const adds = `The dispatcher adds: ${note}${/[.!?]$/.test(note) ? "" : "."}`;
    const i = out.lastIndexOf(CLOSE);
    out = i >= 0 ? `${out.slice(0, i)}${adds} ${out.slice(i)}` : `${out} ${adds}`;
  }
  return out;
}

/** The note as a dispatcher utterance after the call's last one (Q&A evidence only; never in the call transcript). */
export function noteUtterance(note: string, transcript: readonly Utterance[], callId: string): Utterance {
  const last = transcript.at(-1);
  const t = last ? last.tEndMs : 0;
  return { id: randomUUID(), callId, seq: (last?.seq ?? 0) + 1, speaker: "dispatcher", text: note, tStartMs: t, tEndMs: t };
}

/**
 * The note's share of the model's evidence. Dispatcher speech is never Q&A evidence from the call (the
 * validator's echo rule, unchanged), so each quote is checked against the note alone, verbatim, with the
 * validator's dispatcher-eligible purpose; the transcript it is checked against holds only the note.
 */
export function noteRefs(out: QaOutput | null, note: Utterance | null): QuoteRef[] {
  if (note === null || out === null || !out.known) return [];
  return out.evidence.flatMap((e) => {
    const r = validateQuote(e.quote, "address", [note]);
    return r ? [r] : [];
  });
}

/** Answers resting only on the note say so (verbatim note quotes); mixed evidence gets a short attribution. */
export function attributeNote(f: QaFinal, fromNote: readonly QuoteRef[]): QaFinal {
  if (fromNote.length === 0) return f;
  const said = `Not from the caller: the dispatcher's note says '${fromNote.map((r) => r.quote).join("' and '")}'.`;
  if (!f.known) return { answer: said, known: true, evidence: [...fromNote], evidenceDropped: false };
  return { ...f, answer: `${f.answer} Part of this is from the dispatcher's note, not the caller.`, evidence: [...f.evidence, ...fromNote] };
}
