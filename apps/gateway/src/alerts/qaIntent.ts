// What the person on the briefing call said, sorted by code before any model call (D-49): only real
// questions reach the Q&A model; closings, acknowledgments, unclear fragments and questions about
// LastWell itself get fixed lines. Deterministic: no model, no facts.
import { QA_FALLBACK } from "@lastwell/core";

export type QaIntent = "closing" | "ack" | "unclear" | "system" | "question";

export const QA_CLOSING = "You're welcome. The full call details are on the stroke team board. Goodbye.";
export const QA_UNCLEAR = "Sorry, I didn't catch that. What would you like to know about the call?";
export const QA_SYSTEM = "This is LastWell, an automated stroke pre-alert from the 911 call. I can answer questions about what the caller said.";
/** The "not mentioned" answer, rotated per briefing call so repeats sound less robotic. Never adds a fact. */
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
const QWORDS = new Set(["what", "whats", "when", "whens", "where", "wheres", "who", "whos", "why", "how", "hows", "which", "is", "are", "was", "were", "does", "did", "do", "has", "have", "had", "can", "could", "would", "will", "any", "tell"]);
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

export function classifyQa(text: string): QaIntent {
  const w = words(text);
  if (w.length === 0) return "unclear";
  const joined = ` ${w.join(" ")} `;
  if (SYSTEM.some((r) => r.test(joined))) return "system";
  const content = w.filter((x) => !FILLER.has(x) && !ACK.has(x) && !QWORDS.has(x) && !STOP.has(x));
  // A question signal: a "?" from the STT, or a question word once leading fillers/acks/thanks are skipped.
  const lead = w.findIndex((x) => !FILLER.has(x) && !ACK.has(x) && x !== "thanks" && x !== "thank" && x !== "you");
  const asks = text.includes("?") || (lead >= 0 && QWORDS.has(w[lead]!));
  if (asks && content.length > 0) return "question";
  if (CLOSING.some((r) => r.test(joined))) return "closing";
  const rest = w.filter((x) => !FILLER.has(x));
  if (rest.length > 0 && (ACK.has(rest.join(" ")) || rest.every((x) => ACK.has(x)))) return "ack";
  if (content.length === 0) return "unclear";
  return "question";
}
