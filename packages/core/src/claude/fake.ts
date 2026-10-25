// The fake ModelClient (docs/10 §4 row 1, D-34). Deterministic rules standing in for Claude so every
// lane builds and tests without a key. Every quote is an exact substring of a caller utterance (a regex
// match on the original text), so the quote validator keeps it; the level guard and the ladder still
// decide what is shown. Selected by the gateway when LASTWELL_FAKES includes `claude`.
import type { CaseState, FactKind, FastPassOutput, Level, QaOutput, ReasonerOutput, SignKind } from "../contracts/index.js";
import { nextQuestion } from "../state/nextQuestion.js";
import type { FastPassInput, ModelClient, ModelResult, QaInput, ReasonerInput } from "./types.js";

type Sign = FastPassOutput["signs"][number];
type FactOut = FastPassOutput["facts"][number];

const SUBJ = "(?:he|she|they)";
const POSS = "(?:his|her|their|my|the)";
const NEG = /\b(no|not|never|isn'?t|doesn'?t|don'?t|wasn'?t|without|denies)\b/i;

/** Lay phrases per BE-FAST kind, most specific first (a superset of the keyword baseline vocabulary). */
const SIGN_PHRASES: Record<SignKind, readonly RegExp[]> = {
  speech: [
    new RegExp(`\\b${POSS} words (?:come|are coming|came|keep coming) out (?:all )?(?:mixed up|jumbled|garbled|wrong|funny|weird)`, "i"),
    new RegExp(`\\b${SUBJ}(?: just)? can'?t get (?:the|his|her|their|any|my) words out(?: right)?`, "i"),
    new RegExp(`\\b${SUBJ}(?:'s| is| are|'re) (?:mumbling|slurring)(?:[^.!?]*?\\bnot making (?:much |any )?sense)?`, "i"),
    new RegExp(`\\b(?:${POSS} )?speech (?:is|was|sounds|seems) (?:slurred|garbled|weird|funny|off|thick)`, "i"),
    new RegExp(`\\bslurr(?:ed|ing)(?: (?:his|her|their) (?:words|speech))?`, "i"),
    /\bmixed[- ]up words|\bwords (?:are )?(?:all )?mixed up/i,
    /\b(?:using|saying) (?:the )?wrong words|\btalking gibberish|\bgibberish/i,
    /\bcan'?t (?:talk|speak)(?: right| properly| clearly)?/i,
    /\bsounds? (?:like (?:he|she|they)(?:'s| is| are) )?drunk/i,
    /\bnot making (?:any |much )?sense/i,
    /\btrouble (?:talking|speaking|getting (?:the |his |her |their )?words out)/i,
    /\bcan'?t understand (?:me|us|what (?:I|we|people) (?:say|said|are saying))/i,
    /\bmumbl\w+/i,
    /\bslur\w*/i,
  ],
  arms: [
    new RegExp(`\\b(?:${SUBJ} )?can'?t (?:lift|raise|hold|move|grip|feel|squeeze) ${POSS} [a-z ]*?(?:arm|arms|hand|leg|cup|mug|glass|fork|spoon|phone|side)\\b`, "i"),
    new RegExp(`\\b${POSS} (?:right|left) (?:arm|hand|leg|side) (?:is|feels|went|has gone|looks|seems) (?:all )?(?:weak|numb|heavy|limp|dead|floppy|clumsy|tingly|useless)`, "i"),
    /\b(?:right|left|one) side (?:is|feels|went|has gone|of (?:his|her|their) body is) (?:all )?(?:weak|numb|heavy|limp|dead)/i,
    /\bdropp(?:ed|ing) (?:the|his|her|their|a|my) (?:cup|glass|fork|spoon|phone|coffee|mug|keys|plate)/i,
    new RegExp(`\\b(?:weak|numb)(?:ness)? (?:in|on) ${POSS} (?:right |left |one )?(?:arm|hand|leg|side)`, "i"),
    /\b(?:arm|hand|leg) (?:is|feels|went|has gone|keeps) (?:all )?(?:weak|numb|heavy|limp|dead|floppy|falling|drifting|dropping)/i,
    /\bparaly\w+/i,
  ],
  face: [
    new RegExp(`\\b(?:one side of ${POSS} (?:face|mouth)|${POSS} (?:face|mouth|lip|smile)) (?:is |looks |seems |went |'s )?(?:all )?(?:drooping|droopy|hanging|crooked|uneven|lopsided|twisted|pulled down|wrong|funny|weird|numb)`, "i"),
    /\b(?:uneven|crooked|lopsided) (?:smile|face|mouth)/i,
    /\bdrool\w* (?:on|from|out of) (?:one|the (?:right|left)) side/i,
    /\bdroop\w*(?: (?:on|to) (?:one|the (?:right|left)) side)?/i,
  ],
  balance: [
    new RegExp(`(?:\\b${SUBJ} )?(?:keeps?|kept) (?:bumping into|walking into|falling|leaning|stumbling|tipping|staggering|losing (?:his|her|their) balance)[a-z ]*?(?=[,.;!?]|$)`, "i"),
    new RegExp(`(?:\\b${SUBJ}(?: just)? )?can'?t (?:walk|stand) (?:straight|up|properly|right|on (?:his|her|their) own)`, "i"),
    /\b(?:falling|fell|leaning|tipping) (?:to|over to(?:wards?)?|toward) (?:one|the (?:right|left)|his|her|their) (?:side|right|left)/i,
    /\bwalk(?:ing|s)? like (?:he|she|they)(?:'s| is| are) drunk/i,
    new RegExp(`(?:\\b${SUBJ}(?:'s| is| are|'re)(?: just| really| very| so)? )?(?:dizzy|wobbly|unsteady|off balance|off-balance|stumbling|staggering)\\b`, "i"),
    /\b(?:the )?room is spinning|\bvertigo\b/i,
  ],
  eyes: [
    new RegExp(`(?:\\b${SUBJ} )?(?:sees?|seeing|saw) (?:double|two of everything|everything twice)`, "i"),
    /\bdouble vision\b/i,
    /\bblurr(?:y|ed) vision|\bvision (?:is|went|got|seems) (?:blurry|blurred|dark|black|weird|funny|dim)/i,
    new RegExp(`\\bcan'?t see (?:out of|on|from|with) (?:${POSS}|one) (?:right |left )?(?:eye|side)`, "i"),
    /\b(?:lost|losing|loss of) (?:his|her|their|the )?(?:vision|sight)/i,
    /\bblind in (?:one|his|her|their|the (?:right|left)) eye/i,
  ],
};
const SIGN_KINDS: readonly SignKind[] = ["balance", "eyes", "face", "arms", "speech"];

const BLOOD_THINNERS =
  "eliquis|apixaban|xarelto|rivaroxaban|pradaxa|dabigatran|savaysa|edoxaban|warfarin|coumadin|jantoven|heparin|lovenox|enoxaparin|plavix|clopidogrel|brilinta|ticagrelor|effient|prasugrel|aspirin|blood thinners?";
const OTHER_MEDS =
  "insulin|metformin|lisinopril|atorvastatin|lipitor|amlodipine|metoprolol|losartan|levothyroxine|synthroid|gabapentin|prednisone|ozempic|glipizide|furosemide|lasix|simvastatin|omeprazole|tylenol|ibuprofen|keppra|dilantin";
const TAKES = `(?:${SUBJ}|I) (?:takes?|took|is on|'s on|are on|'re on|uses?|was on|has been on) (?:(?:his|her|their|my) )?`;

const CLOCK = "(?:\\d{1,2}(?::\\d{2})?(?: ?(?:am|pm|a\\.m\\.|p\\.m\\.|o'clock))?|noon|midnight)";
const APPROX = "(?:(?:about|around|roughly|maybe|like|approximately|almost|just after|just before) )?";
const AMOUNT =
  "(?:an?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|forty-five|\\d{1,3}|half an?|a couple(?: of)?|couple(?: of)?|a few|few)(?: and a half)?";
const WELL = "(?:fine|okay|ok|normal|good|alright|all right|himself|herself|themselves|well)";
const WELL_SUBJ = `(?:\\b(?:${SUBJ}|I) (?:was|were|seemed|looked|felt) (?:totally |completely |perfectly |just )?)?`;

/** LKW phrases, most precise first; `value` is the time phrase handed to the parser. */
const LKW_RULES: readonly { value: RegExp; quote?: (sentence: string, m: RegExpExecArray) => string | null }[] = [
  // "fine at about 2 PM" (quote widens to "He was fine at about 2 PM")
  { value: new RegExp(`\\b${WELL}(?: (?:until|till|at|since|by|before|earlier|this morning|this afternoon))+ ${APPROX}${CLOCK}`, "i"), quote: widenLeft(new RegExp(`${WELL_SUBJ}$`, "i")) },
  { value: new RegExp(`\\b(?:since|at|around|about) ${APPROX}${CLOCK}(?= ?(?:${SUBJ} (?:was|were) ${WELL}))`, "i") },
  { value: new RegExp(`\\bsince ${APPROX}\\d{1,2}(?::\\d{2})? ?(?:am|pm|a\\.m\\.|p\\.m\\.|o'clock)`, "i") },
  // "about half an hour ago" (quote widens to the "was fine" words in the same sentence)
  { value: new RegExp(`\\b${APPROX}${AMOUNT} (?:hours?|minutes?|mins?|hrs?)(?: or so)? ago\\b`, "i"), quote: withWellWords },
  { value: /\bwoke up (?:like this|with it|this way|like that)/i },
  { value: /\bsince (?:lunch|breakfast|dinner|supper|this morning|this afternoon|last night|yesterday|noon|(?:he|she|they) woke up)\b/i },
  { value: new RegExp(`\\b${WELL} (?:at|before|after|until|till|during) (?:lunch|breakfast|dinner|supper|bedtime)\\b`, "i"), quote: widenLeft(new RegExp(`${WELL_SUBJ}$`, "i")) },
  { value: new RegExp(`\\b${WELL} (?:this morning|last night|yesterday)\\b`, "i"), quote: widenLeft(new RegExp(`${WELL_SUBJ}$`, "i")) },
];

function widenLeft(prefix: RegExp): (sentence: string, m: RegExpExecArray) => string {
  return (sentence, m) => {
    const p = prefix.exec(sentence.slice(0, m.index));
    return p === null ? m[0] : sentence.slice(m.index - p[0].length, m.index + m[0].length);
  };
}

/** "She was fine about half an hour ago" / "About an hour ago, he was fine": the span covering both. */
function withWellWords(sentence: string, m: RegExpExecArray): string {
  const well = new RegExp(`${WELL_SUBJ}\\b${WELL}\\b`, "gi");
  let best: { start: number; end: number } | null = null;
  for (let w = well.exec(sentence); w !== null; w = well.exec(sentence)) {
    if (w[0] === "") {
      well.lastIndex++;
      continue;
    }
    const start = Math.min(w.index, m.index);
    const end = Math.max(w.index + w[0].length, m.index + m[0].length);
    if (best === null || end - start < best.end - best.start) best = { start, end };
  }
  return best === null ? m[0] : sentence.slice(best.start, best.end);
}

/** Sentences of an utterance as [text, offset] so every quote stays an exact substring. */
function sentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

function clean(q: string): string {
  return q.trim().replace(/[\s,;:]+$/u, "");
}

/** Text of the clause before index i (from the last , ; . ! ? or the start). */
function negated(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const cut = Math.max(before.lastIndexOf(","), before.lastIndexOf(";"), before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"));
  return NEG.test(before.slice(cut + 1));
}

function firstMatch(text: string, res: readonly RegExp[]): RegExpExecArray | null {
  for (const re of res) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    for (let m = g.exec(text); m !== null; m = g.exec(text)) {
      if (m[0].trim() === "") {
        g.lastIndex++;
        continue;
      }
      if (!negated(text, m.index)) return m;
    }
  }
  return null;
}

function longEnough(q: string): boolean {
  return q.toLowerCase().replace(/[^a-z0-9]/g, "").length >= 3;
}

export function fakeSigns(text: string): Sign[] {
  const out: (Sign & { at: number })[] = [];
  for (const kind of SIGN_KINDS) {
    const m = firstMatch(text, SIGN_PHRASES[kind]);
    if (m !== null && longEnough(m[0])) out.push({ kind, quote: clean(m[0]), at: m.index });
  }
  // In the order the caller said them.
  return out.sort((a, b) => a.at - b.at).map(({ kind, quote }) => ({ kind, quote }));
}

function fact(kind: FactKind, value: string, quote: string): FactOut | null {
  const q = clean(quote);
  return longEnough(q) && value.trim() !== "" ? { kind, value: value.trim(), quote: q } : null;
}

function lkwFact(text: string): FactOut | null {
  for (const rule of LKW_RULES) {
    for (const s of sentences(text)) {
      const m = new RegExp(rule.value.source, rule.value.flags).exec(s);
      if (m === null) continue;
      const value = clean(m[0]);
      const quote = rule.quote?.(s, m) ?? m[0];
      return fact("last_known_well", value, quote);
    }
  }
  return null;
}

const MALE = /\bmy (father|dad|husband|son|brother|grandfather|grandpa|boyfriend|uncle|stepfather|partner,? he)\b/i;
const FEMALE = /\bmy (mother|mom|mum|wife|daughter|sister|grandmother|grandma|girlfriend|aunt|stepmother)\b/i;

function sexFact(text: string): FactOut | null {
  const m = MALE.exec(text);
  const f = FEMALE.exec(text);
  if (m !== null && (f === null || m.index < f.index)) return fact("sex", "male", m[0]);
  if (f !== null) return fact("sex", "female", f[0]);
  const he = /\b(his|him|he's|he is)\b/i.exec(text);
  const she = /\b(her|hers|she|she's|she is)\b/i.exec(text);
  if (he !== null && (she === null || he.index < she.index)) return fact("sex", "male", he[0]);
  if (she !== null) return fact("sex", "female", she[0]);
  return null;
}

const DECADES: Record<string, string> = {
  twenties: "20s", thirties: "30s", forties: "40s", fifties: "50s", sixties: "60s", seventies: "70s", eighties: "80s", nineties: "90s",
};

function ageFact(text: string): FactOut | null {
  const a = new RegExp(`\\b${SUBJ}(?:'s| is| are) (\\d{1,3})\\b(?! ?(?:minutes|mins|hours|%|percent|pounds|degrees))`, "i").exec(text);
  if (a?.[1] !== undefined) return fact("age", a[1], a[0]);
  const b = /\b(\d{1,3}) years? old\b/i.exec(text);
  if (b?.[1] !== undefined) return fact("age", b[1], b[0]);
  const c = /\bin (?:his|her|their) (twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties)\b/i.exec(text);
  if (c?.[1] !== undefined) return fact("age", DECADES[c[1].toLowerCase()] ?? c[1], c[0]);
  return null;
}

function bloodThinnerFact(text: string, prev: string | null): FactOut | null {
  const none = new RegExp(`\\b(?:(?:${SUBJ}|I) (?:doesn'?t|don'?t|does not|do not) take any|(?:${SUBJ}|I)(?:'s| is| are|'re) not on any|no) blood thinners?`, "i").exec(text);
  if (none !== null) return fact("blood_thinner", "none", none[0]);
  const drug = new RegExp(`(?:\\b${TAKES})?\\b(${BLOOD_THINNERS})\\b`, "i").exec(text);
  if (drug?.[1] !== undefined && !negated(text, drug.index)) return fact("blood_thinner", drug[1], drug[0]);
  // "No, nothing like that." in answer to a blood-thinner question.
  if (prev !== null && new RegExp(`blood thinner|anticoagul|${BLOOD_THINNERS}`, "i").test(prev)) {
    const no = /^\s*(?:no(?:pe)?|none|nothing)\b[^.!?]*/i.exec(text);
    if (no !== null) return fact("blood_thinner", "none", no[0]);
  }
  return null;
}

function medicationFacts(text: string): FactOut[] {
  const out: FactOut[] = [];
  const re = new RegExp(`(?:\\b${TAKES})?\\b(${OTHER_MEDS})\\b`, "gi");
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const f = m[1] === undefined || negated(text, m.index) ? null : fact("medication", m[1].toLowerCase(), m[0]);
    if (f !== null && !out.some((x) => x.value === f.value)) out.push(f);
  }
  return out;
}

/** A cue-word fact: value "no" when the clause before it is negated, else the words as said. */
function cueFact(kind: FactKind, text: string, re: RegExp, value?: (m: RegExpExecArray) => string): FactOut | null {
  const m = re.exec(text);
  if (m === null) return null;
  if (negated(text, m.index)) {
    const before = text.slice(0, m.index);
    const neg = [...before.matchAll(new RegExp(NEG.source, "gi"))].pop();
    return neg?.index === undefined ? null : fact(kind, "no", text.slice(neg.index, m.index + m[0].length));
  }
  return fact(kind, value?.(m) ?? m[0], m[0]);
}

const ADDRESS =
  /\b\d{1,5} (?:[A-Z][a-z]+ )+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Terrace|Circle)\b\.?(?:,? (?:apartment|apt|unit|suite|#) ?\w+)?/;

export function fakeFacts(text: string, prevDispatcherText: string | null): FactOut[] {
  const lkw = lkwFact(text);
  const candidates: (FactOut | null)[] = [
    lkw,
    bloodThinnerFact(text, prevDispatcherText),
    ageFact(text),
    sexFact(text),
    cueFact("diabetes", text, new RegExp(`(?:\\b${SUBJ}(?:'s| is| are|'re) (?:a )?)?\\b(?:diabetic|diabetes|low (?:blood )?sugar)\\b`, "i"), (m) =>
      /low/i.test(m[0]) ? "low sugar" : /diabetes/i.test(m[0]) ? "diabetes" : "diabetic",
    ),
    cueFact("seizure_history", text, /\b(?:seizures?|epilep\w*|(?:was |started |been )?(?:shaking|jerking|convulsing))\b/i),
    cueFact("onset", text, /\b(?:all of a sudden|suddenly|out of nowhere|all at once|came on (?:slowly|gradually|suddenly|fast)|gradually|over the (?:last|past) (?:few )?(?:days|week|hours)|woke up (?:like this|with it|this way|like that))\b/i),
    cueFact("migraine_history", text, /\b(?:(?:gets|has|had|get) (?:bad )?migraines?|migraines?|(?:has|have|had|got) a (?:bad |terrible )?headache)\b/i),
    cueFact("alcohol_or_drugs", text, /\b(?:been drinking|drinking|drank|had (?:a few|some|several) (?:beers|drinks)|beers?|vodka|whiskey|alcohol|took (?:some )?pills|on drugs)\b/i),
    cueFact("head_injury", text, /\b(?:hit (?:his|her|their) head|bumped (?:his|her|their) head|head injury|fell and hit)\b/i),
    cueFact("fever_or_infection", text, /\b(?:(?:has|had|running) a fever|fever|infection|uti|pneumonia|burning up)\b/i),
    ...medicationFacts(text),
  ];
  const addr = ADDRESS.exec(text);
  if (addr !== null) candidates.push(fact("address", clean(addr[0]).replace(/\.$/, ""), clean(addr[0]).replace(/\.$/, "")));
  return candidates.filter((f): f is FactOut => f !== null);
}

// ---------------------------------------------------------------------------------------------
// Reasoner

interface LookalikeRule {
  name: string;
  ask: string;
  cue: RegExp;
}

/** docs/04 §3 rule 4: names and questions; cue words that point to each. */
const LOOKALIKES: readonly LookalikeRule[] = [
  { name: "low blood sugar", ask: "Is he diabetic, and when did he last eat?", cue: new RegExp(`(?:\\b${SUBJ}(?:'s| is| are) )?\\b(?:diabetic|diabetes|insulin|(?:blood )?sugar|skipped (?:a |his |her |their )?(?:meal|dinner|lunch|breakfast)|hasn'?t eaten|didn'?t eat)\\b`, "i") },
  { name: "seizure", ask: "Was there any shaking or jerking before this, or any history of seizures?", cue: /\b(?:seizures?|epilep\w*|shaking|jerking|convuls\w*)\b/i },
  { name: "intoxication", ask: "Has he had any alcohol or drugs today?", cue: /\b(?:been drinking|drinking|drank|beers?|vodka|whiskey|alcohol|took (?:some )?pills|on drugs)\b/i },
  { name: "migraine", ask: "Does she get migraines, and does she have a headache now?", cue: /\b(?:migraines?|headache)\b/i },
  { name: "head injury", ask: "Did he fall and hit his head?", cue: /\b(?:hit (?:his|her|their) head|bumped (?:his|her|their) head|head injury|fell and hit)\b/i },
  { name: "infection", ask: "Does she have a fever or a recent infection?", cue: /\b(?:fever|infection|uti|pneumonia|burning up)\b/i },
];
const BELLS = { name: "Bell's palsy", ask: "Is it only the face, with no arm weakness or speech trouble?" };

const SIGN_LABEL: Record<SignKind, string> = {
  balance: "balance trouble",
  eyes: "vision change",
  face: "facial droop",
  arms: "one-sided weakness",
  speech: "speech trouble",
};

function fakeLookalikes(input: ReasonerInput): ReasonerOutput["lookalikes"] {
  const callerText = input.utterances.filter((u) => u.speaker !== "dispatcher");
  const out: ReasonerOutput["lookalikes"] = [];
  for (const rule of LOOKALIKES) {
    for (const u of callerText) {
      const m = rule.cue.exec(u.text);
      if (m === null || negated(u.text, m.index)) continue;
      out.push({ name: rule.name, ask: rule.ask, quote: clean(m[0]) });
      break;
    }
  }
  const kinds = new Set(input.state.signs.map((s) => s.kind));
  if (kinds.size === 1 && kinds.has("face")) out.push({ name: BELLS.name, ask: BELLS.ask, quote: null });
  return out;
}

function fakeLevel(state: CaseState, lookalikes: ReasonerOutput["lookalikes"]): Level {
  const kinds = new Set(state.signs.map((s) => s.kind));
  if (kinds.size === 0) return "none";
  const focal = [...kinds].some((k) => k === "face" || k === "arms" || k === "speech");
  const explained = lookalikes.some((l) => l.name !== BELLS.name);
  return kinds.size >= 2 && focal && !explained ? "likely" : "possible";
}

function fakeSummary(state: CaseState): string {
  const kinds = SIGN_KINDS.filter((k) => state.signs.some((s) => s.kind === k));
  if (kinds.length === 0) return "No stroke signs heard yet.";
  const labels = kinds.map((k) => SIGN_LABEL[k]);
  const signs = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  const lkw = state.lkw === null || state.lkw.confidence === "unknown" ? "time last normal unknown" : `last normal ${state.lkw.phrase}`;
  const bt = state.facts.find((f) => f.kind === "blood_thinner")?.value;
  const thinner = bt === undefined ? "blood thinners unknown" : bt.toLowerCase() === "none" ? "no blood thinners" : `on ${bt}`;
  return `Caller describes ${signs}; ${lkw}; ${thinner}.`;
}

export function fakeReason(input: ReasonerInput): ReasonerOutput {
  const lookalikes = fakeLookalikes(input);
  const q = nextQuestion({ ...input.state, lookalikes: lookalikes.map((l) => ({ name: l.name, ask: l.ask, ref: null })), reasonerQuestion: null });
  return {
    level: fakeLevel(input.state, lookalikes),
    signs: [],
    last_known_well: null,
    blood_thinner: null,
    other_facts: [],
    lookalikes,
    next_question: q ?? { kind: "none", text: "" },
    summary: fakeSummary(input.state),
  };
}

// ---------------------------------------------------------------------------------------------
// Q&A: answers only from validated facts and signs, quoting their refs.

const QA_TOPICS: readonly { re: RegExp; kinds: readonly (FactKind | SignKind)[] }[] = [
  { re: /blood thinner|anticoag|eliquis|warfarin|xarelto/i, kinds: ["blood_thinner"] },
  { re: /last (known )?(well|normal|seen)|onset|when did (it|this|the symptoms) start/i, kinds: ["last_known_well"] },
  { re: /\bhow old|\bage\b/i, kinds: ["age"] },
  { re: /\baddress|where (is|are)\b/i, kinds: ["address"] },
  { re: /seizure|shaking/i, kinds: ["seizure_history"] },
  { re: /diabet|sugar|insulin/i, kinds: ["diabetes"] },
  { re: /\bface|droop/i, kinds: ["face"] },
  { re: /\barm|\bhand|\bweak/i, kinds: ["arms"] },
  { re: /speech|talk|words|slur/i, kinds: ["speech"] },
  { re: /dizz|balance|walk/i, kinds: ["balance"] },
  { re: /vision|see|eyes/i, kinds: ["eyes"] },
];

export function fakeAnswer(input: QaInput): QaOutput {
  const topic = QA_TOPICS.find((t) => t.re.test(input.questionText));
  if (topic === undefined) return { known: false, answer: "", evidence: [] };
  for (const kind of topic.kinds) {
    const f = input.state.facts.find((x) => x.kind === kind);
    if (f !== undefined) {
      const yes = kind === "blood_thinner" ? (f.value.toLowerCase() === "none" ? "No" : "Yes") : null;
      const lead = yes === null ? f.value : `${yes}, ${f.value}`;
      return { known: true, answer: `${lead}. The caller said '${f.ref.quote}'.`, evidence: [{ quote: f.ref.quote }] };
    }
    const s = input.state.signs.find((x) => x.kind === kind);
    if (s !== undefined) {
      return { known: true, answer: `Yes. The caller said '${s.ref.quote}'.`, evidence: [{ quote: s.ref.quote }] };
    }
  }
  return { known: false, answer: "", evidence: [] };
}

// ---------------------------------------------------------------------------------------------

export function fakeFastPass(input: FastPassInput): FastPassOutput {
  return { signs: fakeSigns(input.utteranceText), facts: fakeFacts(input.utteranceText, input.prevDispatcherText) };
}

export interface FakeModelOptions {
  /** Simulated latency per call (default 0); reported as `ms`. */
  latencyMs?: number;
}

/** docs/10 §4.1: the deterministic ModelClient used when LASTWELL_FAKES includes `claude`. */
export function createFakeModel(opts: FakeModelOptions = {}): ModelClient {
  const latency = Math.max(0, Math.round(opts.latencyMs ?? 0));
  async function run<T>(f: () => T): Promise<ModelResult<T>> {
    if (latency > 0) await new Promise((r) => setTimeout(r, latency));
    return { output: f(), ms: latency };
  }
  return {
    fastPass: (input) => run(() => fakeFastPass(input)),
    reason: (input) => run(() => fakeReason(input)),
    answer: (input) => run(() => fakeAnswer(input)),
  };
}
