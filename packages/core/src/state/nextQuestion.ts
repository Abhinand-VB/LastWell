// Next-question ladder (docs/03 §9, decision D-12). Deterministic: the same state always yields
// the same banner. The banner is always a question for the dispatcher to ask, never an
// instruction to the caller.
import { DateTime } from "luxon";
import type { CaseState, Fact, FactKind, Lookalike, LkwResult, NextQuestion, NextQuestionKind, SignKind } from "../contracts/index.js";

type LadderState = Pick<CaseState, "signs" | "facts" | "lkw" | "lookalikes" | "reasonerQuestion">;

const SIGN_ORDER: readonly SignKind[] = ["face", "arms", "speech", "balance", "eyes"];

/** LKW is established when it is exact/approx with no note that still needs confirmation. */
export function isLkwEstablished(lkw: LkwResult | null): boolean {
  return (
    lkw !== null &&
    (lkw.confidence === "exact" || lkw.confidence === "approx") &&
    lkw.note !== "ampm_assumed" &&
    lkw.note !== "yesterday_assumed"
  );
}

const RESOLVING_FACT: Record<string, FactKind> = {
  "low blood sugar": "diabetes",
  seizure: "seizure_history",
  intoxication: "alcohol_or_drugs",
  migraine: "migraine_history",
  "head injury": "head_injury",
  infection: "fever_or_infection",
};

function lookalikeKey(name: string): string {
  return name.trim().toLowerCase().replace(/[‘’]/g, "'");
}

export interface LookalikeResolution {
  resolved: boolean;
  /** The fact that answered it (panel: `name — answered: {fact.value}`). */
  fact: Fact | null;
  /** Bell's palsy resolved by a non-face sign (panel: `Bell's palsy — less likely: other signs heard`). */
  bySign: boolean;
}

/** docs/03 §9 look-alike resolution table. Unknown names never resolve. */
export function resolveLookalike(lookalike: Pick<Lookalike, "name">, state: Pick<CaseState, "signs" | "facts">): LookalikeResolution {
  const key = lookalikeKey(lookalike.name);
  if (key === "bell's palsy" || key === "bells palsy") {
    if (state.signs.some((s) => s.kind !== "face")) return { resolved: true, fact: null, bySign: true };
    const onset = state.facts.find((f) => f.kind === "onset") ?? null;
    return { resolved: onset !== null, fact: onset, bySign: false };
  }
  const kind = RESOLVING_FACT[key];
  if (kind === undefined) return { resolved: false, fact: null, bySign: false };
  const fact = state.facts.find((f) => f.kind === kind) ?? null;
  return { resolved: fact !== null, fact, bySign: false };
}

type Sex = "male" | "female" | "unknown";

function sexOf(facts: readonly Fact[]): Sex {
  const v = facts.find((f) => f.kind === "sex")?.value.trim().toLowerCase();
  if (v === "male" || v === "man") return "male";
  if (v === "female" || v === "woman") return "female";
  return "unknown";
}

// Canonical texts (docs/03 §9). Pronouns from the sex fact; the they-forms fix verb agreement
// ("were they", "do they") so the dispatcher can read the banner aloud as written.
const TEXT = {
  lkwUnknown: { male: "Ask: when was he last seen completely normal?", female: "Ask: when was she last seen completely normal?", unknown: "Ask: when were they last seen completely normal?" },
  lkwVague: { male: "Ask: what time exactly was he last seen completely normal?", female: "Ask: what time exactly was she last seen completely normal?", unknown: "Ask: what time exactly were they last seen completely normal?" },
  lkwYesterday: "Ask: was that earlier today, or yesterday?",
  bloodThinner: { male: "Ask: does he take any blood thinners, like Eliquis, Xarelto or warfarin?", female: "Ask: does she take any blood thinners, like Eliquis, Xarelto or warfarin?", unknown: "Ask: do they take any blood thinners, like Eliquis, Xarelto or warfarin?" },
  face: { male: "Ask the caller to look at his face: is one side drooping or uneven when he smiles?", female: "Ask the caller to look at her face: is one side drooping or uneven when she smiles?", unknown: "Ask the caller to look at their face: is one side drooping or uneven when they smile?" },
  arms: { male: "Ask: can he lift both arms and keep them up?", female: "Ask: can she lift both arms and keep them up?", unknown: "Ask: can they lift both arms and keep them up?" },
  speech: { male: "Ask: is his speech slurred or are the words mixed up?", female: "Ask: is her speech slurred or are the words mixed up?", unknown: "Ask: is their speech slurred or are the words mixed up?" },
  balance: { male: "Ask: is he dizzy, unsteady, or falling to one side?", female: "Ask: is she dizzy, unsteady, or falling to one side?", unknown: "Ask: are they dizzy, unsteady, or falling to one side?" },
  eyes: "Ask: any sudden trouble seeing — double vision or loss of vision?",
  onset: "Ask: did this start suddenly, or did it come on slowly?",
} as const;

function ampmText(lkw: LkwResult): string | null {
  if (lkw.lkwAt === null) return null;
  const at = DateTime.fromISO(lkw.lkwAt, { setZone: true });
  if (!at.isValid) return null;
  const hour = at.hour % 12 === 0 ? 12 : at.hour % 12;
  return `Ask: was that ${hour} o'clock in the morning, or in the afternoon or evening?`;
}

function lkwQuestion(lkw: LkwResult | null, sex: Sex): NextQuestion {
  if (lkw !== null && lkw.note === "ampm_assumed") {
    const text = ampmText(lkw);
    if (text !== null) return { kind: "lkw", text };
  }
  if (lkw !== null && lkw.note === "yesterday_assumed") return { kind: "lkw", text: TEXT.lkwYesterday };
  if (lkw !== null && lkw.confidence === "vague") return { kind: "lkw", text: TEXT.lkwVague[sex] };
  return { kind: "lkw", text: TEXT.lkwUnknown[sex] };
}

function askText(ask: string): string {
  const t = ask.trim();
  return /^ask\b/i.test(t) ? t : `Ask: ${t}`;
}

function signQuestion(kind: SignKind, sex: Sex): NextQuestion {
  switch (kind) {
    case "face":
    case "arms":
    case "speech":
    case "balance":
      return { kind, text: TEXT[kind][sex] };
    case "eyes":
      return { kind, text: TEXT.eyes };
  }
}

function isSignKind(kind: NextQuestionKind): kind is SignKind {
  return (SIGN_ORDER as readonly string[]).includes(kind);
}

function firstUnresolvedLookalike(state: LadderState): Lookalike | null {
  const first = state.lookalikes[0];
  return first !== undefined && !resolveLookalike(first, state).resolved ? first : null;
}

/** "Open" per docs/03 §9; returns the banner for an open reasoner proposal, else null. */
function reasonerCandidate(state: LadderState, sex: Sex): NextQuestion | null {
  const rq = state.reasonerQuestion;
  if (rq === null) return null;
  const kind = rq.kind;
  if (kind === "none") return null;
  if (kind === "lkw") return isLkwEstablished(state.lkw) ? null : lkwQuestion(state.lkw, sex);
  if (kind === "blood_thinner") {
    return state.facts.some((f) => f.kind === "blood_thinner") ? null : { kind, text: TEXT.bloodThinner[sex] };
  }
  if (kind === "lookalike") {
    const l = firstUnresolvedLookalike(state);
    return l === null ? null : { kind, text: askText(l.ask) };
  }
  if (kind === "onset") return state.facts.some((f) => f.kind === "onset") ? null : { kind, text: TEXT.onset };
  if (kind === "other") return rq.text.trim() === "" ? null : { kind, text: askText(rq.text) };
  if (isSignKind(kind)) return state.signs.some((s) => s.kind === kind) ? null : signQuestion(kind, sex);
  return null;
}

export function nextQuestion(state: LadderState): NextQuestion | null {
  if (state.signs.length === 0) return null;
  const sex = sexOf(state.facts);

  if (!isLkwEstablished(state.lkw)) return lkwQuestion(state.lkw, sex);

  const fromReasoner = reasonerCandidate(state, sex);
  if (fromReasoner !== null) return fromReasoner;

  const lookalike = firstUnresolvedLookalike(state);
  if (lookalike !== null) return { kind: "lookalike", text: askText(lookalike.ask) };

  if (!state.facts.some((f) => f.kind === "blood_thinner")) return { kind: "blood_thinner", text: TEXT.bloodThinner[sex] };

  const missing = SIGN_ORDER.find((k) => !state.signs.some((s) => s.kind === k));
  return missing === undefined ? null : signQuestion(missing, sex);
}
