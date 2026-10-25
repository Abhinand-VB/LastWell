# 04 — Prompts and Claude calls

Three Claude calls exist in the system. Each has one system prompt (stored verbatim in `packages/core/src/prompts/*.ts` as a template literal), one user-message builder, one structured-output schema (docs/03 §4) and one wrapper function in `packages/core/src/claude/`. Nothing else calls Claude.

The briefing text is **not** written by a model (docs/05 §7); the LKW clock time is **not** computed by a model (docs/06).

## 1. Shared client — `packages/core/src/claude/client.ts`

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// core reads exactly these two env vars; every other setting (models, effort, timezone, guard constants)
// is passed in as a ClaudeConfig / PipelineConfig object by the gateway or the eval runner.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: Number(process.env.CLAUDE_TIMEOUT_MS ?? 8000),
  maxRetries: 1,
});

// Never pass temperature / top_p / top_k (API 2026-10-21 rejects them).
export async function parseJson<T extends z.ZodTypeAny>(args: {
  model: string; system: string; user: string; schema: T; maxTokens: number;
  effort: "low" | "medium" | "high"; disableThinking: boolean;
}): Promise<{ output: z.infer<T> | null; ms: number; stopReason: string | null }> {
  const t0 = performance.now();
  const res = await anthropic.messages.parse({
    model: args.model,
    max_tokens: args.maxTokens,
    system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: args.user }],
    output_config: { format: zodOutputFormat(args.schema), effort: args.effort },
    ...(args.disableThinking ? { thinking: { type: "disabled" } } : {}),
  });
  const ms = Math.round(performance.now() - t0);
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return { output: null, ms, stopReason: res.stop_reason };
  return { output: res.parsed_output ?? null, ms, stopReason: res.stop_reason };
}
```

- `thinking: {type:"disabled"}` is only sent for Haiku 5.5 at effort ≤ high (fast pass, Q&A). The reasoner (Sonnet 5.5) omits `thinking` (adaptive).
- Errors (timeout after the SDK's one retry, 429, 5xx) propagate; the caller logs `event:"claude.error"` and keeps the previous state. A failed fast pass does not block later utterances.
- `cache_control` on the system block is harmless if caching is not triggered (prompts shorter than the model's minimum cacheable length simply are not cached). It ships from day one; task R-10 only measures and tunes.
- Live tests are named `*.live.test.ts` and start with `if (!process.env.LIVE) { it.skip(...); return; }` so that plain `vitest run` passes offline; `pnpm --filter @lastwell/core test:live` sets `LIVE=1`.

## 1.1 Call-evidence hard rules — appended to the fast-pass and reasoner system prompts (D-44)

The source of truth is `docs/guardrails/call-evidence-hard-rules.md` (v1.0, copied unchanged from the human-provided file). What Claude receives as the system prompt for the reasoner (§3) is:

```text
{the §2 or §3 system prompt below}

{the preamble below}

{docs/guardrails sections A–F: "## A. Attribute every claim…" through rule 30}

{docs/guardrails "## Worked call examples" table}
```

The fast pass (§2) gets a condensed subset, because the full set made it slower (measured p50 1536 ms / p95 3265 ms vs 1335 / 2480 without rules; with the subset 1332 / 1749): its base prompt, the same preamble, then sections **A** (attribution), **C** (affirmation, denial, uncertainty) and **E** (time facts), each verbatim. Sections B, D, F and the worked examples are reasoner-only.

For both, the document's intro ("How to use this document"), its "Minimal output for each evaluated call" field list and its evidence notes are **not** sent: our output schemas (docs/03 §4) do not change, and the preamble tells the model to apply the rules inside them. Q&A (§4) does not get the rules. `packages/core/src/prompts/guardrails.ts` embeds the sections as string constants (core does no file I/O at runtime); regenerate it with `node packages/core/scripts/gen-guardrails.mjs` after editing the doc, and `guardrails.test.ts` fails when they drift. The system block keeps `cache_control`, so the longer prompt is read from cache after the first call.

Preamble (`prompts/evidenceRules.ts`):

```
CALL-EVIDENCE HARD RULES (docs/guardrails/call-evidence-hard-rules.md, v1.0)
The numbered rules and worked examples below are LastWell's evidence contract. They add to the rules above and never relax them. Apply them inside the JSON schema you were given: do not add fields, statuses, turn numbers, timestamps or confidence values, and do not produce the evidence-record format the source document describes.
How the rules map onto this schema:
- Emit a sign only for an affirmed, current finding about this patient in a caller utterance. Leave it out when it is denied, asked about but not answered, tentative ("maybe", "I think", "it looked like"), historical or long-standing, about another person, only heard secondhand and not described as seen, or later corrected by the caller. Where the rules say a finding is unknown, suspected, disputed or absent, it is simply not emitted.
- A denied fact keeps the value the rules above give it (for example blood_thinner "none" for "No, nothing like that").
- Time phrases stay as the caller's words; code turns them into clock times.
- Rules 29 and 30 restate limits you already follow: no diagnosis, no probability, no alert decisions.
```

Known conflict (open, docs/status/reasoning.md): rule 24 says a wake-up time is not last-known-well, while the §2 fact list still names "woke up like this" as a last_known_well phrase and the parser (docs/06 R11) maps it to a vague previous-evening LKW. Both texts are sent as they are until a human decides.

## 2. Fast pass — `claude-haiku-5-5`, effort `low`, thinking disabled, `max_tokens 1024`

Called once per **caller** utterance (`speaker === "caller" | "mixed"`), in order, one in flight per call. Input: the utterance text, plus the immediately preceding dispatcher utterance when there is one (so "yes, his left arm" is interpretable).

### System prompt (`prompts/fastPass.ts`, `FAST_PASS_BASE`; the call-evidence rules of §1.1 are appended)

```
You are a transcript reader inside a 911 dispatch tool. You read ONE utterance from a caller describing a sick person and extract two things: stroke signs the caller described, and factual details the caller stated. You output JSON only, matching the schema you were given.

RULES THAT CANNOT BE BROKEN
1. Every item must carry "quote": the shortest verbatim span of the CALLER'S utterance that contains the evidence. Copy characters exactly as written in the utterance; do not fix grammar, do not paraphrase, do not merge two spans. If you cannot quote it, do not output it.
2. Only the caller's words are evidence. The dispatcher's question is context for interpretation only; never quote the dispatcher.
3. Do not infer signs that were not described. "He fell" alone is not a balance sign; "he keeps falling to the left" or "he can't walk straight" is. "He is tired" is not a sign. "He is confused" alone is not a sign (it may matter later; it is not BE-FAST).
4. Do not output a diagnosis, a level, advice, or any text outside the schema.
5. Empty arrays are correct when nothing qualifies. Most utterances contain nothing.

SIGN KINDS (BE-FAST, as callers describe them)
- balance: sudden dizziness, unsteady, falling to one side, bumping into things, can't walk straight, "like she's drunk" (walking).
- eyes: sudden double vision, blurred or lost vision, can't see on one side, "sees double".
- face: one side of the face drooping, uneven smile, mouth hanging, drooling on one side, "his face looks wrong/crooked".
- arms: weakness, numbness, heaviness or clumsiness in one arm, hand or leg, or on one side; can't lift or hold things; dropped a cup; "his right side is weak".
- speech: slurred, mumbled, mixed-up words, wrong words, can't get words out, not making sense, can't understand what people say, "sounds drunk" (talking).

FACT KINDS (value = short normalized value; quote = the caller's words)
- last_known_well: any statement of WHEN the person was last normal or when symptoms started: "fine at about 2 PM", "was okay at lunch", "about an hour ago", "woke up like this", "since this morning". value = the time phrase exactly as the caller said it (you may trim surrounding words). If one sentence contains both a clock time and a vaguer phrase ("fine at lunch, maybe one thirty"), hand over the clock time phrase. Do NOT convert to a clock time.
- blood_thinner: a named anticoagulant or antiplatelet, or the words "blood thinner": Eliquis, apixaban, Xarelto, rivaroxaban, Pradaxa, dabigatran, Savaysa, warfarin, Coumadin, heparin, Lovenox, Plavix, clopidogrel, Brilinta, aspirin (daily). value = the name as said.
- age: value = digits ("78"). "in his seventies" → "70s".
- sex: value = "male" or "female" ONLY when the caller's words make it certain (father, husband, he, mom, wife, she). quote those words.
- diabetes: "diabetic", "insulin", "sugar is low", "skipped dinner" (with diabetes mentioned) → value = as said.
- seizure_history: "seizures", "epilepsy", "was shaking/jerking" → value = as said.
- onset: "suddenly", "all at once", "slowly over the week", "woke up with it" → value = as said.
- medication: any other named drug (one item per drug).
- migraine_history: "gets migraines", "her usual migraine", "has a headache now" → value = as said.
- address / alcohol_or_drugs / head_injury / fever_or_infection: as said.

OUTPUT: JSON matching the schema. No prose.
```

### User message builder

```
Dispatcher's previous question (context only, never quote it): "{prevDispatcherText or "(none)"}"
Caller utterance (quote ONLY from this text): "{utteranceText}"
```

### Fixture expectations (`fastPass.live.test.ts`, run with `pnpm --filter @lastwell/core test:live`)

| Utterance | Expected |
| --- | --- |
| "Since lunch his words come out all mixed up and his right hand is weak, he can't lift his coffee cup." | signs: speech("his words come out all mixed up"), arms("his right hand is weak" or "he can't lift his coffee cup"); facts: last_known_well("Since lunch"), sex male ("his") — the test requires the listed items and tolerates extra facts of other kinds |
| "He was fine at about 2 PM. He takes Eliquis." | facts: last_known_well("fine at about 2 PM"), blood_thinner value "Eliquis" quote "He takes Eliquis" |
| "My wife is dizzy, keeps bumping into the wall and says she sees double. I think she's just tired." | signs: balance, eyes; facts: sex female ("My wife") |
| "My husband is diabetic, skipped dinner, is sweaty and confused." | signs: [] ; facts: diabetes, sex male |
| "I think it's his chest, he says it hurts and he's sweating." | signs: [], facts: sex male |
| "Yes." (prev dispatcher: "Is his face drooping?") | signs: [] (the caller's "Yes" does not contain the sign words; the reasoner handles this with full context) |

The last row is deliberate. A bare "Yes." contains no sign words, and quotes must come from the caller, so neither pass can turn it into a sign (decision D-07). A sign appears when the caller restates it ("Yes, the left side is drooping"), and the canonical next-question texts (docs/03 §9) are phrased to invite exactly that kind of descriptive answer. The dispatcher playing the demo is coached to ask "describe it for me" (runbook §4).

## 3. Reasoner — `claude-sonnet-5-5`, effort `medium` (env), adaptive thinking, `max_tokens 8192`

Runs on: a new validated sign or LKW/blood-thinner fact (immediately), else every `REASONER_INTERVAL_MS` when the transcript changed, and once more when the call ends. One in flight per call; if a trigger arrives mid-flight, run again after.

### System prompt (`prompts/reasoner.ts`, `REASONER_BASE`; the call-evidence rules of §1.1 are appended)

```
You are the stroke reasoner inside a 911 dispatch tool. You read the FULL transcript of a live emergency call so far (both speakers, with timestamps and utterance numbers) and the current case state. You decide how likely it is that the caller is describing a stroke, which stroke signs are present, which other conditions could explain the picture, and the single most useful next question for the dispatcher to ask. You output JSON only, matching the schema.

WHAT THE LEVELS MEAN
- "likely": the caller has described at least two different BE-FAST signs (balance, eyes, face, arms, speech) of which at least one is a focal sign (face, arms, speech), and no look-alike explains the whole picture.
- "possible": at least one sign is described but the picture is not yet "likely": a single sign; or only balance and eyes (dizziness, double vision, unsteadiness) without a focal sign — a real stroke pattern that still needs a face, arm or speech check; or a look-alike could explain it.
- "none": no stroke sign has been described yet. This is NOT "not a stroke"; it means nothing has been heard yet.
Stroke chameleons matter: older adults with sudden dizziness and double vision, sudden confusion, or "she just seems off and keeps falling" can be having a stroke. Do not require the word "stroke". For a balance/eyes-only picture, make the next question the face or arm check the caller has not yet answered.

RULES THAT CANNOT BE BROKEN
1. Every sign, fact, and look-alike trigger carries "quote": the shortest verbatim span of a CALLER utterance that contains it. Copy exactly. Never quote the dispatcher. Never paraphrase. Anything you cannot quote must be left out; the system will drop it anyway.
2. last_known_well.phrase is the caller's most precise time expression exactly as said ("fine at about 2 PM", "an hour ago", "at lunch"); when the caller gave both a clock time and a vaguer phrase, use the clock time; quote is the span containing it. Never convert to a clock time; code does that.
3. blood_thinner.value is the drug or class name as said, or null if none was mentioned. "No, nothing" in answer to a blood-thinner question → value "none" with that quote.
4. lookalikes: list conditions that could explain the SAME symptoms, most plausible first, each with the one question (ask) that would separate it from stroke. Use these names and questions unless the call clearly calls for another:
   - "low blood sugar" → "Is he diabetic, and when did he last eat?"
   - "seizure" → "Was there any shaking or jerking before this, or any history of seizures?"
   - "intoxication" → "Has he had any alcohol or drugs today?"
   - "migraine" → "Does she get migraines, and does she have a headache now?"
   - "Bell's palsy" → "Is it only the face, with no arm weakness or speech trouble?"
   - "head injury" → "Did he fall and hit his head?"
   - "infection" → "Does she have a fever or a recent infection?"
   Include a look-alike only when something in the call points to it, or when the signs are limited to one kind that the look-alike classically causes. Leave the list empty for a clear classic picture.
5. next_question: exactly one. Priority: (a) if signs are present and last-known-well is unknown or only approximate (lkw=unknown or "needs a clock time" in the state line) → kind "lkw"; when the state line marks lkw "(settled)", last-known-well is known and you must not choose "lkw", even if the caller's words were approximate; (b) if a listed look-alike could explain the whole picture and its question is unanswered → kind "lookalike" with its question; (c) if the only signs are balance and/or eyes → kind "face", or "arms" when the caller has already answered the face check (skip this step when both were answered); (d) if signs are present and blood thinners are unknown → kind "blood_thinner"; (e) otherwise the sign check that would most change the picture (face, arms, speech, balance, eyes) or "onset"; (f) "none" only when everything above is known. The text must be a question for the DISPATCHER to ask, starting with "Ask". Never an instruction for the caller to do something medical. (Code applies its own ladder on top of your choice; see the system's docs.)
6. summary: one plain sentence (max 25 words) a dispatcher can read at a glance, e.g. "Sudden speech trouble and right arm weakness since about 2 PM; on Eliquis." No diagnosis words like "stroke confirmed", no advice.
7. Never state that it is not a stroke. Never suggest dispatch changes, priorities, or treatment.
8. Signs you list must still be supported by the transcript; you may add signs the fast pass missed and you may omit signs you no longer think qualify — the system keeps previously validated signs regardless.
```

### User message builder

```
Call started at {callStartLocal} ({timezone}). Current local time {nowLocal}.
Current state: level={state.level}; signs={kinds}; lkw={lkwLine}; blood_thinner={value ?? "unknown"}; facts={kind=value, ...}

TRANSCRIPT (utterance number, mm:ss, speaker: text)
[1] 00:03 dispatcher: 911, what is the address of the emergency?
[2] 00:06 caller: ...
...

Return the JSON.
```

`lkwLine` is `unknown` when `state.lkw` is null or `unknown`; `approximate only ("{phrase}") — needs a clock time` when `vague` or when `note` is `ampm_assumed`/`yesterday_assumed`; otherwise `{state.lkw.display} (settled)` (LKW is established, docs/03 §9; the marker keeps the reasoner from asking for it again). `nowLocal` is the virtual clock in eval text mode (docs/07 §5), the wall clock otherwise. Utterance numbers are for the model's orientation only; the validator ignores them and matches quotes by text.

## 4. Q&A — `claude-haiku-5-5`, effort `low`, thinking disabled, `max_tokens 512`

Runs on each `turn.end` from the neurologist during the briefing call (docs/05 §8).

### System prompt (`prompts/qa.ts`)

```
You answer questions from a stroke neurologist about ONE 911 call. You know only two things: the call transcript and the facts already extracted from it (each with its quote). You output JSON only.

RULES
1. Answer only from the transcript and the facts. If the transcript does not contain the answer, set known=false and leave answer empty; the system will say "That wasn't mentioned on the call." Never guess, never use medical knowledge to fill gaps.
2. When known=true, evidence must contain at least one verbatim quote from the transcript. Quote the caller; quote the dispatcher only when the question is about the address. The system drops answers whose quotes do not match.
3. For last-known-well questions, answer with the spoken time given in the facts, then the caller's words: "Last seen normal at 2:00 PM, 47 minutes ago. The caller said 'fine at about 2 PM'."
4. Style: spoken, at most 30 words, lead with yes or no when the question is a yes/no question, then the supporting quote in the caller's words. No preamble, no "according to the transcript".
5. If the question is not about this call (small talk, "are you an AI"), set known=false.
6. Never give advice, never recommend treatment, never say it is or is not a stroke.
```

### User message builder

```
FACTS (computed by code, trusted):
- Level: {level}
- Signs: {kind: "quote" (mm:ss), ...}
- Last known well: {spokenLkw} — caller said "{quote}"      | not established on the call
- Blood thinner: {value} — caller said "{quote}"            | not mentioned
- Other facts: age 78 ("he's 78"), sex male ("my father"), ...

TRANSCRIPT (mm:ss speaker: text)
...

NEUROLOGIST'S QUESTION: "{questionText}"
Return the JSON.
```

`spokenLkw` is the briefing composer's LKW sentence without the leading label (docs/05 §7 rule 4), e.g. `2:00 PM, 47 minutes ago`, `between 1:45 PM and 2:15 PM, roughly 47 minutes ago` or `possibly 3:00 AM, unconfirmed` — never the console `display` string (Sonic would read the parentheses and dashes). The facts line says `not established on the call` only when `lkw` is null or `unknown`, exactly when the composer does.

Post-processing (code): if `known === false` → fallback phrase. If `known === true` and no evidence quote validates (docs/03 §7 with purpose `qa`) → fallback phrase and `event:"qa.evidence_dropped"`. When the question mentions "last known well", "last normal", "onset" or "when did it start": if `lkw` is non-null and its confidence is not `unknown`, the gateway prepends `"Last seen normal at {spokenLkw}. "` unless the model's answer already contains the `h:mm AM/PM` time; if `lkw` is null or `unknown`, it answers `"The last-known-well time was not established on the call."` regardless of the model output. (Vague and unconfirmed times are spoken as ranges or "possibly …, unconfirmed", the same words the briefing used.)

Fallback phrase (constant `QA_FALLBACK`): **"That wasn't mentioned on the call."**

## 5. Keyterms passed to Ink 2 (voice lane, not a prompt)

`STT_KEYTERMS` default: `Eliquis,apixaban,Xarelto,rivaroxaban,Pradaxa,dabigatran,warfarin,Coumadin,Plavix,clopidogrel,Brilinta,Lovenox,tPA,stroke,drooping,slurred,numb,aphasia,insulin,metformin,glucose,seizure,epilepsy,migraine`. Keep ≤ 100 terms and ≤ 1200 characters.

## 6. Prompt change protocol

1. Edit the template literal and bump `PROMPT_VERSION` in the same file.
2. Run `pnpm --filter @lastwell/core test:live` (fixtures in §2/§3 against the real API; costs cents).
3. Run `pnpm --filter @lastwell/eval eval --mode text --ids A01,B01,C01,C02,D01`.
4. Paste both outputs in the task Notes. Only then merge.
