// D-53 dispatcher override and briefing notes. Approve works at every level, but below `possible` only
// with an explicit `override: true` (409 `override_required` otherwise, docs/03 §6); the briefing's first
// sentence is then OVERRIDE_LINE and the audit records an override. `notes` (≤ 200 chars,
// trimmed) is read verbatim after the close as "The dispatcher adds: {notes}" (no model). On the Q&A
// the note is one more dispatcher utterance the model may quote; anything found only in the note is
// answered as "The dispatcher said …", never as the caller.
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { validateQuote, type Level, type QaOutput, type QuoteRef, type Utterance } from "@lastwell/core";
import type { QaFinal } from "./qaAnswer.js";

export const NOTE_MAX = 200;

const Notes = z
  .string()
  .transform((x) => x.trim())
  .refine((x) => x.length <= NOTE_MAX, `at most ${NOTE_MAX} characters`)
  .optional();
/** `notes` per docs/03 §6 (D-53); `note` is accepted as an alias. */
export const ApproveExtras = z.object({ notes: Notes, note: Notes, override: z.boolean().optional() }).transform((x) => ({ note: x.notes || x.note || null, override: x.override === true }));

/** The composer's fixed first sentence (packages/core/src/briefing/compose.ts). */
const OPENING = "Stroke pre-alert from nine one one, approved by the dispatcher.";
export const OVERRIDE_LINE = "Dispatcher-initiated pre-alert. LastWell has not detected stroke signs on this call.";

export const belowPossible = (level: Level): boolean => level === "none";

/** docs/05 §7: sentence 1 swapped below `possible`; sentence 8 (the note, verbatim) after the close. */
export function withDispatcherInput(text: string, level: Level, note: string | null): string {
  const out = belowPossible(level) ? (text.startsWith(OPENING) ? `${OVERRIDE_LINE}${text.slice(OPENING.length)}` : `${OVERRIDE_LINE} ${text}`) : text;
  return note ? `${out} The dispatcher adds: ${note}` : out;
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
  const said = `The dispatcher said '${fromNote.map((r) => r.quote).join("' and '")}'.`;
  if (!f.known) return { answer: said, known: true, evidence: [...fromNote], evidenceDropped: false };
  return { ...f, answer: `${f.answer} Part of this is from the dispatcher's note, not the caller.`, evidence: [...f.evidence, ...fromNote] };
}
