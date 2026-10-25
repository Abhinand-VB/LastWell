// docs/04 §4 system prompt, verbatim. Change protocol: docs/04 §6 (edit here and in docs/04, bump PROMPT_VERSION).
import type { CaseState, LkwResult } from "../contracts/index.js";
import { isAntiplatelet, spokenLkwSentence } from "../briefing/compose.js";
import type { QaInput } from "../claude/types.js";
import { mmss } from "./reasoner.js";
export const QA_SYSTEM = `You answer questions from a stroke neurologist about ONE 911 call. You know only two things: the call transcript and the facts already extracted from it (each with its quote). You output JSON only.

RULES
1. Answer only from the transcript and the facts. If the transcript does not contain the answer, set known=false and leave answer empty; the system will say "That wasn't mentioned on the call." Never guess, never use medical knowledge to fill gaps.
2. When known=true, evidence must contain at least one verbatim quote from the transcript. Quote the caller; quote the dispatcher only when the question is about the address. The system drops answers whose quotes do not match.
3. For last-known-well questions, answer with the spoken time given in the facts, then the caller's words: "Last seen normal at 2:00 PM, 47 minutes ago. The caller said 'fine at about 2 PM'."
4. Style: spoken, at most 30 words, lead with yes or no when the question is a yes/no question, then the supporting quote in the caller's words. No preamble, no "according to the transcript".
5. If the question is not about this call (small talk, "are you an AI"), set known=false.
6. Never give advice, never recommend treatment, never say it is or is not a stroke.`;

export const QA_PROMPT_VERSION = "qa-2";

/** docs/04 §4 fallback phrase. */
export const QA_FALLBACK = "That wasn't mentioned on the call.";

/** `spokenLkw`: the composer's LKW sentence without the leading label (docs/05 §7 rule 4); null when not established. */
export function spokenLkw(lkw: LkwResult | null, now: Date, tz: string): string | null {
  if (lkw === null || lkw.confidence === "unknown" || lkw.lkwAt === null) return null;
  return spokenLkwSentence(lkw, now, tz).replace(/^Last known well:\s*/, "").replace(/\.$/, "");
}

/** D-41(c): an antiplatelet (aspirin, Plavix, Brilinta…) is named, never presented as a blood thinner. */
function bloodThinnerLine(bt: CaseState["facts"][number] | undefined): string {
  if (bt === undefined) return "not mentioned";
  if (isAntiplatelet(bt.value)) return `none mentioned; takes ${bt.value}, an antiplatelet, not a blood thinner — caller said "${bt.ref.quote}"`;
  return `${bt.value} — caller said "${bt.ref.quote}"`;
}

/** docs/04 §4 user message. */
export function buildQaUser(input: QaInput): string {
  const { state } = input;
  const signs = state.signs.map((s) => `${s.kind}: "${s.ref.quote}" (${mmss(s.ref.tMs)})`);
  const lkw = spokenLkw(state.lkw, input.now, input.timezone);
  const bt = state.facts.find((f) => f.kind === "blood_thinner");
  const other = state.facts
    .filter((f) => f.kind !== "last_known_well" && f.kind !== "blood_thinner")
    .map((f) => `${f.kind.replace(/_/g, " ")} ${f.value} ("${f.ref.quote}")`);
  return [
    "FACTS (computed by code, trusted):",
    `- Level: ${state.level}`,
    `- Signs: ${signs.length > 0 ? signs.join(", ") : "none heard"}`,
    `- Last known well: ${lkw === null || state.lkw === null ? "not established on the call" : `${lkw} — caller said "${state.lkw.ref.quote}"`}`,
    `- Blood thinner: ${bloodThinnerLine(bt)}`,
    `- Other facts: ${other.length > 0 ? other.join(", ") : "none"}`,
    "",
    "TRANSCRIPT (mm:ss speaker: text)",
    ...input.utterances.map((u) => `${mmss(u.tStartMs)} ${u.speaker}: ${u.text}`),
    "",
    `NEUROLOGIST'S QUESTION: "${input.questionText}"`,
    "Return the JSON.",
  ].join("\n");
}
