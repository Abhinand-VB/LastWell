// Run the quote validator (docs/03 §7) over a model output. Everything that fails is dropped and
// reported, so the caller can count it (`state.droppedCount`) and log `validator.dropped`.
import type {
  FactKind,
  FastPassOutput,
  Level,
  Lookalike,
  NextQuestion,
  QuoteRef,
  ReasonerOutput,
  SignKind,
  Utterance,
} from "../contracts/index.js";
import { checkQuote, phraseWithinQuote, type DropReason, type QuotePurpose } from "./quotes.js";

export interface ValidatedSign {
  kind: SignKind;
  ref: QuoteRef;
}

export interface ValidatedFact {
  kind: FactKind;
  value: string;
  ref: QuoteRef;
}

export interface Drop {
  /** "sign:arms", "fact:blood_thinner", "lookalike:seizure" … */
  item: string;
  quote: string;
  reason: DropReason | "lkw_phrase_not_in_quote" | "empty_value";
}

export interface ValidatedFastPass {
  signs: ValidatedSign[];
  facts: ValidatedFact[];
  drops: Drop[];
}

export interface ValidatedReasoner {
  modelLevel: Level;
  signs: ValidatedSign[];
  /** Includes the reasoner's last_known_well (value = phrase) and blood_thinner. */
  facts: ValidatedFact[];
  lookalikes: Lookalike[];
  nextQuestion: NextQuestion; // the raw proposal; the ladder decides what is shown
  summary: string;
  drops: Drop[];
}

function sign(kind: SignKind, quote: string, utterances: readonly Utterance[], drops: Drop[]): ValidatedSign | null {
  const r = checkQuote(quote, "sign", utterances);
  if (r.ok) return { kind, ref: r.ref };
  drops.push({ item: `sign:${kind}`, quote, reason: r.reason });
  return null;
}

function fact(kind: FactKind, value: string, quote: string, utterances: readonly Utterance[], drops: Drop[]): ValidatedFact | null {
  const item = `fact:${kind}`;
  const v = value.trim();
  if (v === "") {
    drops.push({ item, quote, reason: "empty_value" });
    return null;
  }
  const r = checkQuote(quote, kind satisfies QuotePurpose, utterances);
  if (!r.ok) {
    drops.push({ item, quote, reason: r.reason });
    return null;
  }
  if (kind === "last_known_well" && !phraseWithinQuote(v, r.ref.quote)) {
    drops.push({ item, quote, reason: "lkw_phrase_not_in_quote" });
    return null;
  }
  return { kind, value: v, ref: r.ref };
}

function present<T>(x: T | null): x is T {
  return x !== null;
}

/** Fast pass outputs may only quote the one utterance they were given. */
export function validateFastPass(out: FastPassOutput, utterance: Utterance): ValidatedFastPass {
  const drops: Drop[] = [];
  const only = [utterance];
  return {
    signs: out.signs.map((s) => sign(s.kind, s.quote, only, drops)).filter(present),
    facts: out.facts.map((f) => fact(f.kind, f.value, f.quote, only, drops)).filter(present),
    drops,
  };
}

/** The reasoner may quote any utterance of the transcript it was shown. */
export function validateReasoner(out: ReasonerOutput, transcript: readonly Utterance[]): ValidatedReasoner {
  const drops: Drop[] = [];
  const signs = out.signs.map((s) => sign(s.kind, s.quote, transcript, drops)).filter(present);

  const facts: ValidatedFact[] = [];
  if (out.last_known_well !== null) {
    const f = fact("last_known_well", out.last_known_well.phrase, out.last_known_well.quote, transcript, drops);
    if (f) facts.push(f);
  }
  if (out.blood_thinner !== null) {
    const f = fact("blood_thinner", out.blood_thinner.value, out.blood_thinner.quote, transcript, drops);
    if (f) facts.push(f);
  }
  for (const o of out.other_facts) {
    const f = fact(o.kind, o.value, o.quote, transcript, drops);
    if (f) facts.push(f);
  }

  // A look-alike whose quote fails is kept with ref null (the question is still worth asking)
  // and still counts as a drop.
  const lookalikes: Lookalike[] = out.lookalikes.map((l) => {
    if (l.quote === null) return { name: l.name, ask: l.ask, ref: null };
    const r = checkQuote(l.quote, "lookalike", transcript);
    if (r.ok) return { name: l.name, ask: l.ask, ref: r.ref };
    drops.push({ item: `lookalike:${l.name}`, quote: l.quote, reason: r.reason });
    return { name: l.name, ask: l.ask, ref: null };
  });

  return {
    modelLevel: out.level,
    signs,
    facts,
    lookalikes,
    nextQuestion: { kind: out.next_question.kind, text: out.next_question.text },
    summary: out.summary,
    drops,
  };
}
