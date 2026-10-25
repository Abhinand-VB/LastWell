// What the person on the briefing call said, sorted by code before any model call (D-49): only real
// questions reach the Q&A model; closings, acknowledgments, unclear fragments and questions about
// LastWell itself get fixed lines. Deterministic: no model, no facts.
import { QA_FALLBACK } from "@lastwell/core";

export type QaIntent = "closing" | "ack" | "unclear" | "system" | "question";

export const QA_CLOSING = "You're welcome. The full call details are on the pre-alert board. Goodbye.";
export const QA_UNCLEAR = "Sorry, I didn't catch that. What would you like to know about the call?";
export const QA_SYSTEM = "This is LastWell, an automated stroke pre-alert from the 911 call. I can answer questions about what the caller said.";
/** The "not mentioned" answer, rotated per briefing call so repeats sound less robotic. Never adds a fact. */
/** Spoken only when a model answer is not ready ~700 ms after the question (cached audio, D-50). */
export const QA_FILLERS = ["One moment.", "Let me check the call."] as const;
export const QA_NOT_MENTIONED = [QA_FALLBACK, "The caller didn't mention that.", "That didn't come up on the call."] as const;

const SYSTEM = [
  / who( i|)s (this|that|speaking|calling)( please)? $/,
  /\bwho are you\b/,
  /\bwho am i (talking|speaking) (to|with)\b/,
  / what( i|)s (this|this call|lastwell|last well)( please)? $/,
  /\bwhat are you\b/,
  /\b(is|are) (this|that|you) (a |an )?(real )?(person|human|robot|machine|bot|computer|recording|ai|automated|real)\b/,
  /\bam i (talking|speaking) to a (person|human|robot|machine|bot|computer|recording)\b/,
];
const CLOSING = [
  /\bthank(s| you)\b/,
  /\bthx\b/,
  /\bgot it\b/,
  /\bthat( is|s|ll be| will be) (all|it|everything)\b/,
  /\b(good)?bye\b/,
  /\bwe ?re (good|done|all set)\b/,
  /\b(im|i am) (good|done|all set)\b/,
  /\bno (more )?(further )?questions\b/,
];
const ACK = new Set(["ok", "okay", "k", "mm", "mhm", "hmm", "mmhm", "mm hm", "uh huh", "uhhuh", "right", "yeah", "yes", "yep", "yup", "sure", "alright", "all right", "i see", "understood", "cool", "great", "good", "no", "nope", "copy", "roger", "noted", "go on", "go ahead"]);
const FILLER = new Set(["um", "uh", "er", "erm", "ah", "eh", "huh", "sorry", "pardon", "so", "well", "and", "oh", "like", "hello", "hi", "hey"]);
/** Case topics: an utterance naming one is treated as a question even without a question word. */
const TOPIC =
  /\b(medicines?|medications?|meds|pills?|blood ?thinners?|thinners?|anticoagula\w*|eliquis|apixaban|xarelto|warfarin|coumadin|plavix|aspirin|insulin|time|normal|last|start\w*|onset|ago|age|old|face|facial|droop\w*|smile|arms?|legs?|hands?|weak\w*|numb\w*|speech|speak\w*|talk\w*|slurr?\w*|words|seizures?|fits?|sugar|glucose|diabet\w*|address|street|where|symptoms?|signs?|vision|eyes?|double|balance|dizz\w*|walk\w*|fall\w*|history|allerg\w*|head|injur\w*|alcohol|drink\w*|drugs?|fever|migraines?|headaches?)\b/;
const QWORDS = new Set(["what", "whats", "when", "whens", "where", "wheres", "who", "whos", "why", "how", "hows", "which", "is", "are", "was", "were", "does", "did", "do", "has", "have", "had", "can", "could", "would", "will", "any", "tell"]);
const WH = new Set(["what", "whats", "when", "whens", "where", "wheres", "who", "whos", "why", "how", "hows", "which"]);
const STOP = new Set(["the", "a", "an", "is", "it", "that", "this", "you", "i", "he", "she", "they", "me", "to", "of", "again", "repeat", "say", "come", "please", "thanks", "thank", "thx", "bye", "goodbye"]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((w) => w !== "");
}

/** A 1–3 word piece with no case topic ("Is he on?", "When was he?"): likely half a question split by a pause. */
export function isFragment(text: string): boolean {
  const w = words(text);
  return w.length > 0 && w.length <= 3 && !TOPIC.test(` ${w.join(" ")} `) && !SYSTEM.some((r) => r.test(` ${w.join(" ")} `)) && !CLOSING.some((r) => r.test(` ${w.join(" ")} `)) && !w.every((x) => ACK.has(x) || FILLER.has(x));
}

/** Below this Ink confidence (when Ink sends one) the utterance is treated as unclear. */
export const MIN_CONFIDENCE = 0.5;

/**
 * Only something that looks like a question reaches the answer path: a question word with some
 * content, or a case topic. Noise and gibberish ("oogabooga") get the reprompt, never "not mentioned".
 */
export function classifyQa(text: string, confidence?: number): QaIntent {
  const w = words(text);
  if (w.length === 0) return "unclear";
  if (confidence !== undefined && confidence < MIN_CONFIDENCE) return "unclear";
  const joined = ` ${w.join(" ")} `;
  if (SYSTEM.some((r) => r.test(joined))) return "system";
  const content = w.filter((x) => !FILLER.has(x) && !ACK.has(x) && !QWORDS.has(x) && !STOP.has(x));
  // A question word once leading fillers/acks/thanks are skipped, or a wh-word anywhere.
  const lead = w.findIndex((x) => !FILLER.has(x) && !ACK.has(x) && x !== "thanks" && x !== "thank" && x !== "you");
  const asks = (lead >= 0 && QWORDS.has(w[lead]!)) || w.some((x) => WH.has(x));
  if (TOPIC.test(joined) || (asks && content.length > 0)) return "question";
  if (CLOSING.some((r) => r.test(joined))) return "closing";
  const rest = w.filter((x) => !FILLER.has(x));
  if (rest.length > 0 && (ACK.has(rest.join(" ")) || rest.every((x) => ACK.has(x)))) return "ack";
  return "unclear";
}
