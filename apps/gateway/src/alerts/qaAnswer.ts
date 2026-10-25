// docs/04 §4 post-processing (code, not the model): quote-or-drop on the evidence, the fallback phrase,
// and the last-known-well rule (the spoken time always comes from the parser, never from the model).
import { QA_FALLBACK, spokenLkw, validateQuote, type CaseState, type QaOutput, type QuoteRef, type Utterance } from "@lastwell/core";

export const LKW_QUESTION = /\b(last known well|last (seen )?normal|last well|onset|when did (it|this|the symptoms?) start|what time did (it|this) start)\b/i;
export const LKW_NOT_ESTABLISHED = "The last-known-well time was not established on the call.";
const CLOCK = /\b\d{1,2}:\d{2}\s?(AM|PM)\b/i;

export interface QaFinal {
  answer: string;
  known: boolean;
  evidence: QuoteRef[];
  /** The model said known=true but none of its quotes validated. */
  evidenceDropped: boolean;
}

export function finalizeQa(
  question: string,
  out: QaOutput | null,
  snapshot: { state: CaseState; transcript: readonly Utterance[] },
  now: Date,
  tz: string,
): QaFinal {
  let final: QaFinal = { answer: QA_FALLBACK, known: false, evidence: [], evidenceDropped: false };
  if (out !== null && out.known && out.answer.trim() !== "") {
    const evidence = out.evidence.flatMap((e) => {
      const ref = validateQuote(e.quote, { qa: question }, snapshot.transcript);
      return ref ? [ref] : [];
    });
    final = evidence.length > 0 ? { answer: out.answer.trim(), known: true, evidence, evidenceDropped: false } : { ...final, evidenceDropped: true };
  }
  if (LKW_QUESTION.test(question)) {
    const spoken = spokenLkw(snapshot.state.lkw, now, tz);
    if (spoken === null) return { answer: LKW_NOT_ESTABLISHED, known: false, evidence: [], evidenceDropped: final.evidenceDropped };
    const ref = snapshot.state.lkw?.ref;
    if (!final.known) {
      return { answer: `Last seen normal at ${spoken}. The caller said '${ref?.quote ?? ""}'.`, known: true, evidence: ref ? [ref] : [], evidenceDropped: final.evidenceDropped };
    }
    if (!CLOCK.test(final.answer)) final = { ...final, answer: `Last seen normal at ${spoken}. ${final.answer}` };
  }
  return final;
}
