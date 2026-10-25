// Q&A fast path (no model call): the common questions are answered by code from the CaseState that
// was snapshotted at approval. Every quote spoken is re-validated against the call transcript (the
// same quote-or-drop rule as model evidence, purpose `qa`); anything that does not validate is left
// out, and a topic with nothing left falls through to the model. LKW wording comes from the parser.
import { isAntiplatelet, spokenLkw, validateQuote, type CaseState, type QuoteRef, type SignKind, type Utterance } from "@lastwell/core";
import { LKW_NOT_ESTABLISHED, LKW_QUESTION, type QaFinal } from "./qaAnswer.js";

export type FastTopic = "lkw" | "meds" | "patient" | "signs" | "address";

const TOPICS: Array<[FastTopic, RegExp]> = [
  ["lkw", LKW_QUESTION],
  ["lkw", /\b(how long ago|how long (has|since)|time since|what time|when did (he|she|they|it|this|the symptoms?)\b.*\b(start|begin|happen|notice)|when was (he|she|they) last (seen|ok|okay|fine|well))\b/i],
  ["meds", /\b(blood ?thinners?|thinners?|anticoagula\w*|eliquis|apixaban|xarelto|rivaroxaban|pradaxa|warfarin|coumadin|plavix|clopidogrel|aspirin|meds|medications?|medicines?|pills|taking anything|on anything)\b/i],
  ["patient", /\b(how old|age|male or female|man or woman|sex|gender)\b/i],
  ["signs", /\b(signs?|symptoms?|what (did|does) (the caller|they|she|he) (say|see|notice|describe|report)|what happened|what'?s going on|face|facial|droop\w*|arms?|weak\w*|speech|speak\w*|talk\w*|slurr?\w*|words|balance|dizz\w*|vision|see double|eyes?)\b/i],
  ["address", /\b(address|location|where (is|are|was|were) (he|she|they|the patient)|where (do|does) (he|she|they) live)\b/i],
];

const SIGN_OF: Array<[SignKind, RegExp]> = [
  ["face", /\b(face|facial|droop\w*|smile)\b/i],
  ["arms", /\b(arms?|hands?|weak\w*|lift)\b/i],
  ["speech", /\b(speech|speak\w*|talk\w*|slurr?\w*|words)\b/i],
  ["balance", /\b(balance|dizz\w*|walk\w*|fall\w*|stand\w*)\b/i],
  ["eyes", /\b(vision|see|seeing|double|eyes?|blind)\b/i],
];
const SIGN_LABEL: Record<SignKind, string> = {
  balance: "balance trouble",
  eyes: "vision change",
  face: "facial droop",
  arms: "one-sided weakness",
  speech: "speech trouble",
};
const SIGN_ORDER: readonly SignKind[] = ["balance", "eyes", "face", "arms", "speech"];

export function fastTopics(question: string): FastTopic[] {
  const out: FastTopic[] = [];
  for (const [t, r] of TOPICS) if (r.test(question) && !out.includes(t)) out.push(t);
  return out;
}

const said = (q: string) => `The caller said '${q}'.`;

/** One topic's sentence + the refs it speaks, or null when the state has nothing (validated) for it. */
function topicAnswer(topic: FastTopic, question: string, state: CaseState, ok: (r: QuoteRef) => QuoteRef | null, now: Date, tz: string): { text: string; refs: QuoteRef[]; known: boolean } | null {
  switch (topic) {
    case "lkw": {
      const spoken = spokenLkw(state.lkw, now, tz);
      if (spoken === null) return { text: LKW_NOT_ESTABLISHED, refs: [], known: false };
      const ref = state.lkw ? ok(state.lkw.ref) : null;
      if (!ref) return null;
      return { text: `Last seen normal at ${spoken}. ${said(ref.quote)}`, refs: [ref], known: true };
    }
    case "meds": {
      const parts: string[] = [];
      const refs: QuoteRef[] = [];
      const bt = state.facts.find((f) => f.kind === "blood_thinner");
      const btRef = bt ? ok(bt.ref) : null;
      if (bt && btRef) {
        const v = bt.value.trim();
        parts.push(v.toLowerCase() === "none" ? "The caller says no blood thinners." : isAntiplatelet(v) ? `Takes ${v}, per the caller.` : `Blood thinner: ${v}, per the caller.`);
        parts.push(said(btRef.quote));
        refs.push(btRef);
      }
      const meds = state.facts.filter((f) => f.kind === "medication").flatMap((f) => (ok(f.ref) ? [f.value.trim()] : []));
      if (meds.length > 0) parts.push(`Other medications mentioned: ${meds.join(", ")}.`);
      for (const f of state.facts.filter((x) => x.kind === "medication")) {
        const r = ok(f.ref);
        if (r) refs.push(r);
      }
      return parts.length > 0 ? { text: parts.join(" "), refs, known: true } : null;
    }
    case "patient": {
      const age = state.facts.find((f) => f.kind === "age");
      const sex = state.facts.find((f) => f.kind === "sex");
      const ageRef = age && /^\d{1,3}$/.test(age.value.trim()) ? ok(age.ref) : null;
      const sexRef = sex ? ok(sex.ref) : null;
      const noun = sexRef ? (sex!.value.trim().toLowerCase() === "male" ? "man" : sex!.value.trim().toLowerCase() === "female" ? "woman" : null) : null;
      if (!ageRef && !noun) return null;
      const who = ageRef && noun ? `${age!.value.trim()}-year-old ${noun}` : ageRef ? `${age!.value.trim()} years old` : `A ${noun}`;
      const refs = [ageRef, noun ? sexRef : null].filter((r): r is QuoteRef => r !== null);
      return { text: `${who}, per the caller. ${said(refs[0]!.quote)}`, refs, known: true };
    }
    case "signs": {
      const asked = SIGN_OF.filter(([, r]) => r.test(question)).map(([k]) => k);
      const signs = state.signs.map((s) => ({ s, ref: ok(s.ref) })).filter((x): x is { s: (typeof state.signs)[number]; ref: QuoteRef } => x.ref !== null);
      if (asked.length > 0 && !/\b(signs?|symptoms?|what happened|what'?s going on)\b/i.test(question)) {
        // A specific sign: answer only when it was heard; otherwise let the model look at the transcript.
        const hit = signs.find((x) => asked.includes(x.s.kind));
        return hit ? { text: `Yes, ${SIGN_LABEL[hit.s.kind]}. ${said(hit.ref.quote)}`, refs: [hit.ref], known: true } : null;
      }
      if (signs.length === 0) return null;
      const kinds = SIGN_ORDER.filter((k) => signs.some((x) => x.s.kind === k));
      const quotes = [...new Map(signs.map((x) => [x.ref.quote, x.ref])).values()].sort((a, b) => a.quote.length - b.quote.length).slice(0, 2);
      return {
        text: `Signs heard: ${kinds.map((k) => SIGN_LABEL[k]).join(" and ")}. The caller said ${quotes.map((r) => `'${r.quote}'`).join(" and ")}.`,
        refs: quotes,
        known: true,
      };
    }
    case "address": {
      const a = state.facts.find((f) => f.kind === "address");
      const ref = a ? ok(a.ref) : null;
      return a && ref ? { text: `The address given on the call: ${a.value.trim()}.`, refs: [ref], known: true } : null;
    }
  }
}

/** A deterministic answer, or null to use the model. Never invents: every spoken quote re-validates. */
export function answerFromState(question: string, state: CaseState, transcript: readonly Utterance[], now: Date, tz: string): (QaFinal & { topics: FastTopic[] }) | null {
  const topics = fastTopics(question);
  if (topics.length === 0 || topics.length > 2) return null;
  const ok = (r: QuoteRef) => validateQuote(r.quote, { qa: question }, transcript);
  const parts = topics.map((t) => topicAnswer(t, question, state, ok, now, tz));
  if (parts.some((p) => p === null)) return null;
  const done = parts as Array<{ text: string; refs: QuoteRef[]; known: boolean }>;
  return {
    answer: done.map((p) => p.text).join(" "),
    known: done.some((p) => p.known),
    evidence: done.flatMap((p) => p.refs),
    evidenceDropped: false,
    topics,
  };
}
