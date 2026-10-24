import { describe, expect, it } from "vitest";
import {
  CaseState,
  initialCaseState,
  type Confidence,
  type FastPassOutput,
  type LkwNote,
  type LkwParseInput,
  type LkwParseOutput,
  type LkwResult,
  type ReasonerOutput,
  type Speaker,
  type Utterance,
} from "../contracts/index.js";
import { guardLevel } from "../validate/levelGuard.js";
import { validateFastPass, validateReasoner } from "../validate/outputs.js";
import { isLkwEstablished, nextQuestion, resolveLookalike } from "./nextQuestion.js";
import { addWarning, applyFastPass, applyReasoner, publish, removeWarning, type ReducerConfig } from "./reducer.js";

const CALL = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607";
const T0 = "2026-10-25T14:47:00.000-07:00";
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function utt(seq: number, speaker: Speaker, text: string): Utterance {
  return { id: id(seq), callId: CALL, seq, speaker, text, tStartMs: seq * 3000, tEndMs: seq * 3000 + 2000 };
}

// Card A (docs/07 §4), numbered by seq.
const U = {
  addr: utt(2, "caller", "It's 1842 Clement Street, apartment 3. It's my father, he's 78."),
  what: utt(4, "caller", "Since lunch his words come out all mixed up and his right hand is weak, he can't lift his coffee cup."),
  awake: utt(6, "caller", "Yes, he's awake, he's sitting on the couch, he just can't get the words out right."),
  ask: utt(7, "dispatcher", "When was he last seen completely normal?"),
  fine: utt(8, "caller", "He was fine at about 2 PM. We had lunch and he was fine."),
  thinner: utt(10, "caller", "Yes, he takes Eliquis. For his heart."),
};
const ALL = Object.values(U).sort((a, b) => a.seq - b.seq);

// Stand-in for the docs/06 parser (R-05): fixed answers per phrase.
const PARSED: Record<string, { confidence: Confidence; note: LkwNote | null; lkwAt: string | null }> = {
  "since lunch": { confidence: "vague", note: null, lkwAt: "2026-10-25T12:30:00.000-07:00" },
  "fine at about 2 PM": { confidence: "approx", note: null, lkwAt: "2026-10-25T14:00:00.000-07:00" },
  "at 2 PM": { confidence: "exact", note: null, lkwAt: "2026-10-25T14:00:00.000-07:00" },
  "about 2 PM": { confidence: "approx", note: null, lkwAt: "2026-10-25T14:05:00.000-07:00" },
  "had lunch": { confidence: "vague", note: null, lkwAt: "2026-10-25T12:30:00.000-07:00" },
  "at 3": { confidence: "approx", note: "ampm_assumed", lkwAt: "2026-10-25T03:00:00.000-07:00" },
  "at 9 PM": { confidence: "approx", note: "yesterday_assumed", lkwAt: "2026-10-24T21:00:00.000-07:00" },
};
const parsed: LkwParseInput[] = [];
function fakeParse(input: LkwParseInput): LkwParseOutput {
  parsed.push(input);
  const key = Object.keys(PARSED).find((k) => k.toLowerCase() === input.phrase.toLowerCase());
  const p = key === undefined ? undefined : PARSED[key];
  if (!p) {
    return { phrase: input.phrase, lkwAt: null, rangeStart: null, rangeEnd: null, confidence: "unknown", note: null, display: "unknown — ask when last seen normal" };
  }
  return { phrase: input.phrase, lkwAt: p.lkwAt, rangeStart: p.lkwAt, rangeEnd: p.lkwAt, confidence: p.confidence, note: p.note, display: `${p.confidence} ${input.phrase}` };
}

const cfg: ReducerConfig = { likelyMinDistinctSigns: 2, timezone: "America/Los_Angeles", streamStartedAt: T0, parseLkw: fakeParse };
const empty = (): CaseState => initialCaseState(CALL, T0);

function fast(state: CaseState, u: Utterance, out: FastPassOutput) {
  return applyFastPass(state, validateFastPass(out, u), ALL, cfg, 812.4);
}

function reasonerOut(over: Partial<ReasonerOutput>): ReasonerOutput {
  return {
    level: "none",
    signs: [],
    last_known_well: null,
    blood_thinner: null,
    other_facts: [],
    lookalikes: [],
    next_question: { kind: "none", text: "" },
    summary: "Summary.",
    ...over,
  };
}

function reason(state: CaseState, over: Partial<ReasonerOutput>) {
  return applyReasoner(state, validateReasoner(reasonerOut(over), ALL), ALL, cfg, 3100);
}

const armsSign: FastPassOutput = { signs: [{ kind: "arms", quote: "he can't lift his coffee cup" }], facts: [] };
const twoSigns: FastPassOutput = {
  signs: [
    { kind: "arms", quote: "his right hand is weak" },
    { kind: "speech", quote: "his words come out all mixed up" },
  ],
  facts: [],
};

function lkwOf(phrase: string, seq: number): LkwResult {
  const p = fakeParse({ phrase, saidAt: T0, timezone: cfg.timezone });
  return { ...p, ref: { quote: phrase, utteranceId: id(seq), tMs: seq * 3000, speaker: "caller" }, minutesAgo: null };
}

describe("level guard (docs/03 §8)", () => {
  it("a fast-pass sign on an empty state → possible, LKW question (unknown variant)", () => {
    const { state, newSign } = fast(empty(), U.what, armsSign);
    expect(newSign).toBe(true);
    expect(state.level).toBe("possible");
    expect(state.nextQuestion).toEqual({ kind: "lkw", text: "Ask: when were they last seen completely normal?" });
    expect(state.latency.fastPassMs).toBe(812);
  });

  it("uses he/his once a sex fact exists", () => {
    const s = fast(empty(), U.addr, { signs: [], facts: [{ kind: "sex", value: "male", quote: "my father" }] }).state;
    const { state } = fast(s, U.what, armsSign);
    expect(state.nextQuestion?.text).toBe("Ask: when was he last seen completely normal?");
  });

  it("two distinct kinds + reasoner likely → likely", () => {
    const s = fast(empty(), U.what, twoSigns).state;
    expect(s.level).toBe("possible"); // modelLevel still none before the reasoner runs
    expect(reason(s, { level: "likely" }).state.level).toBe("likely");
  });

  it("one kind + reasoner likely → possible", () => {
    const s = fast(empty(), U.what, armsSign).state;
    const r = reason(s, { level: "likely" }).state;
    expect(r.level).toBe("possible");
    expect(r.modelLevel).toBe("likely");
  });

  it("two kinds + reasoner none → possible (floor)", () => {
    const s = fast(empty(), U.what, twoSigns).state;
    expect(reason(s, { level: "none" }).state.level).toBe("possible");
  });

  it("zero signs + reasoner likely → none", () => {
    expect(reason(empty(), { level: "likely" }).state.level).toBe("none");
  });

  it("balance + eyes + reasoner likely → possible (D-21: likely needs a focal sign)", () => {
    expect(guardLevel([{ kind: "balance" }, { kind: "eyes" }], "likely").level).toBe("possible");
    expect(guardLevel([{ kind: "balance" }, { kind: "speech" }], "likely").level).toBe("likely");
    expect(guardLevel([{ kind: "arms" }, { kind: "speech" }], "likely", 3).level).toBe("possible");
  });
});

describe("next-question ladder (docs/03 §9)", () => {
  const withSigns = (): CaseState => fast(empty(), U.what, armsSign).state;
  const ladder = (s: CaseState, over: Partial<CaseState>) => nextQuestion({ ...s, ...over });
  const thinnerFact = { kind: "blood_thinner" as const, value: "Eliquis", ref: { quote: "he takes Eliquis", utteranceId: id(10), tMs: 30000, speaker: "caller" as const }, source: "fast" as const };
  const diabetesFact = { ...thinnerFact, kind: "diabetes" as const, value: "diabetic" };

  it("no signs → null", () => {
    expect(nextQuestion(empty())).toBeNull();
  });

  it('vague LKW → "what time exactly" even when the reasoner proposed blood_thinner', () => {
    const q = ladder(withSigns(), { lkw: lkwOf("since lunch", 4), reasonerQuestion: { kind: "blood_thinner", text: "Ask: blood thinners?" } });
    expect(q).toEqual({ kind: "lkw", text: "Ask: what time exactly were they last seen completely normal?" });
  });

  it("LKW approx + no blood-thinner fact → blood_thinner", () => {
    const q = ladder(withSigns(), { lkw: lkwOf("fine at about 2 PM", 8) });
    expect(q).toEqual({ kind: "blood_thinner", text: "Ask: do they take any blood thinners, like Eliquis, Xarelto or warfarin?" });
  });

  it("LKW approx + reasoner lookalike with an unresolved look-alike → that look-alike", () => {
    const q = ladder(withSigns(), {
      lkw: lkwOf("fine at about 2 PM", 8),
      reasonerQuestion: { kind: "lookalike", text: "Ask: diabetic?" },
      lookalikes: [{ name: "low blood sugar", ask: "Is he diabetic, and when did he last eat?", ref: null }],
    });
    expect(q).toEqual({ kind: "lookalike", text: "Ask: Is he diabetic, and when did he last eat?" });
  });

  it("a resolved look-alike (diabetes fact present) is skipped", () => {
    const s = withSigns();
    const lookalikes = [{ name: "low blood sugar", ask: "Is he diabetic?", ref: null }];
    const q = ladder(s, {
      lkw: lkwOf("fine at about 2 PM", 8),
      facts: [...s.facts, diabetesFact],
      reasonerQuestion: { kind: "lookalike", text: "Ask: diabetic?" },
      lookalikes,
    });
    expect(q?.kind).toBe("blood_thinner");
    expect(resolveLookalike(lookalikes[0]!, { signs: s.signs, facts: [diabetesFact] })).toMatchObject({ resolved: true, fact: diabetesFact });
  });

  it("ampm_assumed → the morning/afternoon confirmation text", () => {
    const q = ladder(withSigns(), { lkw: lkwOf("at 3", 8) });
    expect(q).toEqual({ kind: "lkw", text: "Ask: was that 3 o'clock in the morning, or in the afternoon or evening?" });
    expect(isLkwEstablished(lkwOf("at 3", 8))).toBe(false);
  });

  it("yesterday_assumed → the earlier-today-or-yesterday text", () => {
    expect(ladder(withSigns(), { lkw: lkwOf("at 9 PM", 8) })?.text).toBe("Ask: was that earlier today, or yesterday?");
  });

  it("Bell's palsy resolves when a non-face sign exists", () => {
    const bell = { name: "Bell's palsy", ask: "Is it only the face, with no arm weakness or speech trouble?" };
    const faceOnly = fast(empty(), U.what, { signs: [{ kind: "face", quote: "his words come out" }], facts: [] }).state;
    expect(resolveLookalike(bell, faceOnly).resolved).toBe(false);
    const withArm = withSigns(); // arms
    expect(resolveLookalike(bell, withArm)).toEqual({ resolved: true, fact: null, bySign: true });
    expect(resolveLookalike({ name: "Bell’s palsy" }, withArm).resolved).toBe(true);
  });

  it("an unknown look-alike name never resolves", () => {
    expect(resolveLookalike({ name: "dehydration" }, { signs: [], facts: [diabetesFact] }).resolved).toBe(false);
  });

  it("everything known → first missing sign in order face, arms, speech, balance, eyes", () => {
    const s = withSigns();
    const q = ladder(s, { lkw: lkwOf("fine at about 2 PM", 8), facts: [...s.facts, thinnerFact] });
    expect(q?.kind).toBe("face");
    expect(q?.text).toBe("Ask the caller to look at their face: is one side drooping or uneven when they smile?");
  });

  it("an open reasoner sign check wins over the default order; a closed one is skipped", () => {
    const s = withSigns();
    const base = { lkw: lkwOf("fine at about 2 PM", 8), facts: [...s.facts, thinnerFact] };
    expect(ladder(s, { ...base, reasonerQuestion: { kind: "speech", text: "x" } })?.kind).toBe("speech");
    expect(ladder(s, { ...base, reasonerQuestion: { kind: "arms", text: "x" } })?.kind).toBe("face");
  });

  it('reasoner "other" text is prefixed with "Ask: " when needed', () => {
    const s = withSigns();
    const base = { lkw: lkwOf("fine at about 2 PM", 8) };
    expect(ladder(s, { ...base, reasonerQuestion: { kind: "other", text: "is he on any new medication?" } })?.text).toBe("Ask: is he on any new medication?");
    expect(ladder(s, { ...base, reasonerQuestion: { kind: "other", text: "Ask if he fell" } })?.text).toBe("Ask if he fell");
  });
});

describe("reducer replacement rules (docs/03 §3, docs/06 §8)", () => {
  it("parses a fast-pass LKW with saidAt = streamStartedAt + tStartMs", () => {
    parsed.length = 0;
    const r = fast(empty(), U.fine, { signs: [], facts: [{ kind: "last_known_well", value: "fine at about 2 PM", quote: "He was fine at about 2 PM" }] });
    expect(r.newKeyFact).toBe(true);
    expect(r.state.lkw?.confidence).toBe("approx");
    expect(r.state.lkw?.ref.utteranceId).toBe(U.fine.id);
    expect(parsed[0]).toEqual({ phrase: "fine at about 2 PM", saidAt: "2026-10-25T14:47:24.000-07:00", timezone: "America/Los_Angeles" });
  });

  it("a reasoner LKW from seq 4 does not replace a fast-pass LKW from seq 8", () => {
    const s = fast(empty(), U.fine, { signs: [], facts: [{ kind: "last_known_well", value: "fine at about 2 PM", quote: "fine at about 2 PM" }] }).state;
    const r = reason(s, { last_known_well: { phrase: "Since lunch", quote: "Since lunch his words" } }).state;
    expect(r.lkw?.phrase).toBe("fine at about 2 PM");
    expect(r.facts.find((f) => f.kind === "last_known_well")?.value).toBe("fine at about 2 PM");
  });

  it("an LKW said later replaces an earlier one", () => {
    const s = fast(empty(), U.what, { signs: [], facts: [{ kind: "last_known_well", value: "since lunch", quote: "Since lunch" }] }).state;
    expect(s.lkw?.confidence).toBe("vague");
    const r = reason(s, { last_known_well: { phrase: "fine at about 2 PM", quote: "He was fine at about 2 PM" } }).state;
    expect(r.lkw?.phrase).toBe("fine at about 2 PM");
  });

  it("equal seq → higher confidence wins; equal confidence keeps the existing one", () => {
    const s = fast(empty(), U.fine, { signs: [], facts: [{ kind: "last_known_well", value: "fine at about 2 PM", quote: "fine at about 2 PM" }] }).state;
    // Same utterance, a different phrase that the stand-in parser rates exact.
    const fineAt2: Utterance = { ...U.fine, text: "He was fine at 2 PM. We had lunch and he was fine." };
    const all = ALL.map((u) => (u.id === fineAt2.id ? fineAt2 : u));
    const exact = applyReasoner(s, validateReasoner(reasonerOut({ last_known_well: { phrase: "at 2 PM", quote: "fine at 2 PM" } }), all), all, cfg).state;
    expect(exact.lkw?.confidence).toBe("exact");
    // Same seq, lower confidence → keep exact.
    const lower = applyReasoner(exact, validateReasoner(reasonerOut({ last_known_well: { phrase: "had lunch", quote: "We had lunch" } }), all), all, cfg).state;
    expect(lower.lkw?.phrase).toBe("at 2 PM");
    // Same seq, equal confidence → keep the existing one.
    const tie = applyReasoner(s, validateReasoner(reasonerOut({ last_known_well: { phrase: "about 2 PM", quote: "about 2 PM" } }), ALL), ALL, cfg).state;
    expect(tie.lkw?.phrase).toBe("fine at about 2 PM");
  });

  it("an unknown result never erases a parsed earlier one", () => {
    const s = fast(empty(), U.what, { signs: [], facts: [{ kind: "last_known_well", value: "since lunch", quote: "Since lunch" }] }).state;
    const r = fast(s, U.awake, { signs: [], facts: [{ kind: "last_known_well", value: "he's awake", quote: "he's awake" }] }).state;
    expect(r.lkw?.phrase).toBe("since lunch");
    expect(r.facts.find((f) => f.kind === "last_known_well")?.value).toBe("he's awake"); // the phrase is still stored on the fact
  });

  it("a fact from a later seq replaces; an earlier one does not; equal seq → longer value", () => {
    const s = fast(empty(), U.addr, { signs: [], facts: [{ kind: "age", value: "78", quote: "he's 78" }] }).state;
    const later: Utterance = utt(12, "caller", "Sorry, he's 79 actually.");
    const all = [...ALL, later];
    const r = applyFastPass(s, validateFastPass({ signs: [], facts: [{ kind: "age", value: "79", quote: "he's 79" }] }, later), all, cfg).state;
    expect(r.facts.find((f) => f.kind === "age")?.value).toBe("79");
    const back = applyReasoner(r, validateReasoner(reasonerOut({ other_facts: [{ kind: "age", value: "78", quote: "he's 78" }] }), all), all, cfg).state;
    expect(back.facts.find((f) => f.kind === "age")?.value).toBe("79");
    const thin = fast(empty(), U.thinner, { signs: [], facts: [{ kind: "blood_thinner", value: "Eliquis", quote: "he takes Eliquis" }] }).state;
    const longer = reason(thin, { blood_thinner: { value: "Eliquis for his heart", quote: "he takes Eliquis" } }).state;
    expect(longer.facts.find((f) => f.kind === "blood_thinner")?.value).toBe("Eliquis for his heart");
    expect(longer.facts.filter((f) => f.kind === "blood_thinner")).toHaveLength(1);
  });

  it("medications coexist, one per distinct value", () => {
    const u = utt(12, "caller", "He takes metformin and lisinopril, and also Metformin at night.");
    const all = [...ALL, u];
    const r = applyFastPass(empty(), validateFastPass({ signs: [], facts: [
      { kind: "medication", value: "metformin", quote: "He takes metformin" },
      { kind: "medication", value: "lisinopril", quote: "lisinopril" },
      { kind: "medication", value: "Metformin", quote: "Metformin at night" },
    ] }, u), all, cfg).state;
    expect(r.facts.filter((f) => f.kind === "medication").map((f) => f.value)).toEqual(["metformin", "lisinopril"]);
  });
});

describe("reducer invariants", () => {
  it("signs are never removed and dedupe by (kind, utteranceId)", () => {
    const s = fast(empty(), U.what, twoSigns).state;
    const r = reason(s, { level: "likely", signs: [{ kind: "arms", quote: "he can't lift his coffee cup" }] });
    expect(r.state.signs).toHaveLength(2);
    expect(r.newSign).toBe(false);
    const again = reason(r.state, { level: "possible", signs: [] }).state;
    expect(again.signs.map((x) => x.kind).sort()).toEqual(["arms", "speech"]);
    const other = reason(again, { signs: [{ kind: "speech", quote: "he just can't get the words out right" }] });
    expect(other.newSign).toBe(true);
    expect(other.state.signs).toHaveLength(3);
  });

  it("validator drops are counted; a look-alike with a bad quote is kept with ref null", () => {
    const s = fast(empty(), U.what, { signs: [{ kind: "face", quote: "his face is drooping" }], facts: [] }).state;
    expect(s.droppedCount).toBe(1);
    expect(s.signs).toHaveLength(0);
    const r = reason(s, {
      lookalikes: [
        { name: "seizure", ask: "Any shaking?", quote: "he was shaking" },
        { name: "low blood sugar", ask: "Is he diabetic?", quote: null },
      ],
    }).state;
    expect(r.droppedCount).toBe(2);
    expect(r.lookalikes).toEqual([
      { name: "seizure", ask: "Any shaking?", ref: null },
      { name: "low blood sugar", ask: "Is he diabetic?", ref: null },
    ]);
  });

  it("a fast-pass quote from another utterance is dropped (fast pass sees only its utterance)", () => {
    const v = validateFastPass({ signs: [{ kind: "arms", quote: "he can't lift his coffee cup" }], facts: [] }, U.awake);
    expect(v.signs).toHaveLength(0);
    expect(v.drops[0]).toMatchObject({ item: "sign:arms", reason: "no_match" });
  });

  it("an LKW phrase that is not inside its quote is dropped", () => {
    const v = validateFastPass({ signs: [], facts: [{ kind: "last_known_well", value: "about 2 PM", quote: "We had lunch" }] }, U.fine);
    expect(v.facts).toHaveLength(0);
    expect(v.drops[0]?.reason).toBe("lkw_phrase_not_in_quote");
  });

  it("version increments on every publish and nowhere else", () => {
    const s0 = empty();
    const s1 = fast(s0, U.what, armsSign).state;
    expect(s1.version).toBe(0);
    const p1 = publish(s1, "2026-10-25T14:47:15.000-07:00");
    const p2 = publish(p1, new Date("2026-10-25T21:47:20.000Z"));
    expect([p1.version, p2.version]).toEqual([1, 2]);
    expect(p1.updatedAt).toBe("2026-10-25T14:47:15.000-07:00");
    expect(CaseState.safeParse(p2).success).toBe(true);
  });

  it("warnings round-trip through transitions and JSON", () => {
    let s = addWarning(empty(), "reasoner_delayed");
    s = addWarning(addWarning(s, "stt_degraded"), "stt_degraded");
    s = fast(s, U.what, armsSign).state;
    s = reason(s, { level: "possible" }).state;
    expect(s.warnings).toEqual(["reasoner_delayed", "stt_degraded"]);
    const back = CaseState.parse(JSON.parse(JSON.stringify(publish(s, T0))));
    expect(back.warnings).toEqual(["reasoner_delayed", "stt_degraded"]);
    expect(removeWarning(back, "reasoner_delayed").warnings).toEqual(["stt_degraded"]);
  });

  it("Card A end to end: possible → likely, ladder lkw(vague) → blood_thinner → none of the checks left but face", () => {
    let s = empty();
    s = fast(s, U.addr, { signs: [], facts: [{ kind: "age", value: "78", quote: "he's 78" }, { kind: "sex", value: "male", quote: "my father" }, { kind: "address", value: "1842 Clement Street, apartment 3", quote: "1842 Clement Street, apartment 3" }] }).state;
    const r1 = fast(s, U.what, { ...twoSigns, facts: [{ kind: "last_known_well", value: "Since lunch", quote: "Since lunch" }] });
    expect(r1.newSign && r1.newKeyFact).toBe(true);
    s = r1.state;
    expect(s.level).toBe("possible");
    expect(s.nextQuestion?.text).toBe("Ask: what time exactly was he last seen completely normal?");
    s = reason(s, { level: "likely", next_question: { kind: "blood_thinner", text: "Ask: blood thinners?" } }).state;
    expect(s.level).toBe("likely");
    s = fast(s, U.fine, { signs: [], facts: [{ kind: "last_known_well", value: "fine at about 2 PM", quote: "He was fine at about 2 PM" }] }).state;
    expect(s.nextQuestion?.text).toBe("Ask: does he take any blood thinners, like Eliquis, Xarelto or warfarin?");
    s = fast(s, U.thinner, { signs: [], facts: [{ kind: "blood_thinner", value: "Eliquis", quote: "he takes Eliquis" }] }).state;
    expect(s.nextQuestion?.kind).toBe("face");
    expect(s.facts.map((f) => f.kind).sort()).toEqual(["address", "age", "blood_thinner", "last_known_well", "sex"]);
    expect(CaseState.safeParse(s).success).toBe(true);
  });
});
