# 03 — Contracts

Every shape below is implemented **once**, as a zod schema in `packages/core/src/contracts/`, and imported everywhere else. Types are inferred from the schemas (`z.infer`). The section numbers here are referenced from other docs and from task acceptance criteria; do not renumber.

Changing a contract = updating the schema, the producer, every consumer and the test fixtures in one PR, plus a line in `docs/09` decision log.

## 1. Primitives

```ts
import { z } from "zod";

export const SignKind = z.enum(["balance", "eyes", "face", "arms", "speech"]);
// BE-FAST "T" (time) is not a sign a caller describes; it is represented by the LKW fact.

export const FactKind = z.enum([
  "last_known_well",   // value = the time phrase exactly as spoken, e.g. "fine at about 2 PM"
  "blood_thinner",     // value = drug or class name as spoken: "Eliquis", "warfarin", "blood thinner"
  "age",               // value = digits, e.g. "78"
  "sex",               // value = "male" | "female" (inferred from words like father/wife; quote required)
  "diabetes",          // value = "yes" | "no" | "insulin" | "skipped meal" …
  "seizure_history",   // value = "yes" | "no" | "epilepsy"
  "onset",             // value = how it started: "sudden" | "gradual" | "woke up with it"
  "medication",        // value = any other named medication (several facts of this kind may coexist)
  "address",           // value = location as spoken
  "alcohol_or_drugs",  // value = as spoken
  "head_injury",       // value = as spoken
  "fever_or_infection",// value = as spoken
  "migraine_history"   // value = "yes" | "no" | "headache now" …
]);

export const Level = z.enum(["none", "possible", "likely"]);
export const Speaker = z.enum(["caller", "dispatcher", "mixed"]);
export const CallMode = z.enum(["phone", "browser", "replay"]);
// replay = a scripted call fed through the live pipeline for the demo (Cards B/C) and the smoke test. The eval runner writes no calls.
export const Confidence = z.enum(["exact", "approx", "vague", "unknown"]);
export const E164 = z.string().regex(/^\+[1-9]\d{6,14}$/);
export const Uuid = z.string().uuid();
```

## 2. Transcript and evidence

```ts
export const Utterance = z.object({
  id: Uuid,
  callId: Uuid,
  seq: z.number().int().positive(),
  speaker: Speaker,
  text: z.string().min(1),          // exactly as Ink 2 returned it (trimmed)
  tStartMs: z.number().int().nonnegative(), // ms since the call's audio stream started (docs/05 §5); displayed as mm:ss
  tEndMs: z.number().int().nonnegative(),
});

// A validated quote. Only code creates these (see §7). Models never output utteranceId or t.
export const QuoteRef = z.object({
  quote: z.string().min(3),         // verbatim substring of utterances[utteranceId].text (after normalization match)
  utteranceId: Uuid,
  tMs: z.number().int().nonnegative(), // = utterance.tStartMs
  speaker: Speaker,
});
```

## 3. CaseState (the document the console renders)

```ts
export const Sign = z.object({ kind: SignKind, ref: QuoteRef, source: z.enum(["fast", "reasoner"]) });

export const Fact = z.object({
  kind: FactKind,
  value: z.string().min(1),
  ref: QuoteRef,
  source: z.enum(["fast", "reasoner"]),
});

export const LkwResult = z.object({
  phrase: z.string(),                 // the time expression handed to the parser
  ref: QuoteRef,                      // where the phrase was said
  lkwAt: z.string().datetime({ offset: true }).nullable(),   // ISO with offset, point estimate
  rangeStart: z.string().datetime({ offset: true }).nullable(),
  rangeEnd: z.string().datetime({ offset: true }).nullable(),
  confidence: Confidence,
  note: z.enum(["ampm_assumed", "yesterday_assumed", "older_than_24h", "clipped_to_now"]).nullable(), // parser caveats (docs/06 §5)
  display: z.string(),                // "2:00 PM (1:45–2:15 PM)" | "yesterday 10:00 PM (8:00–11:59 PM)" | "unknown — ask when last seen normal"
  minutesAgo: z.number().int().nullable(), // computed at render time by the UI from lkwAt; stored null
});

export const Lookalike = z.object({
  name: z.string(),                   // "low blood sugar", "seizure", "intoxication", "migraine", "Bell's palsy", "head injury", "infection"
  ask: z.string(),                    // the question the dispatcher should ask, e.g. "Is he diabetic?"
  ref: QuoteRef.nullable(),           // the words that raised it, when the model quoted some
});

export const NextQuestionKind = z.enum([
  "lkw", "blood_thinner", "lookalike", "face", "arms", "speech", "balance", "eyes", "onset", "other", "none",
]);

export const NextQuestion = z.object({
  kind: NextQuestionKind,
  text: z.string(),                   // canonical phrasing from state/nextQuestion.ts for known kinds
});

export const Latency = z.object({
  fastPassMs: z.number().int().nullable(),
  reasonerMs: z.number().int().nullable(),
  sttMs: z.number().int().nullable(),      // wall time of turn.end − wall time of the last turn.update that changed the transcript (≈ time from the speaker stopping to the final)
});

export const Warning = z.enum(["stt_degraded", "reasoner_delayed"]);

export const CaseState = z.object({
  callId: Uuid,
  version: z.number().int().nonnegative(),
  level: Level,                       // after level guard (§8)
  modelLevel: Level,                  // what the reasoner said, for the latency/debug readout
  signs: z.array(Sign),               // deduplicated by (kind, utteranceId); never removed once added
  facts: z.array(Fact),               // one per kind (except `medication`: one per distinct value); replacement rule below
  lkw: LkwResult.nullable(),
  lookalikes: z.array(Lookalike),     // replaced on each reasoner run
  nextQuestion: NextQuestion.nullable(),
  summary: z.string().nullable(),     // one plain sentence from the reasoner, shown as a tooltip only
  reasonerQuestion: NextQuestion.nullable(), // the reasoner's latest raw proposal, kept so the ladder can re-run after a fast pass; not rendered
  droppedCount: z.number().int().nonnegative(), // model items dropped by the validator this call (honesty counter)
  warnings: z.array(Warning),         // active degradation banners (docs/05 §9); empty when healthy
  latency: Latency,
  updatedAt: z.string().datetime({ offset: true }),
});
```

Initial state: `level:"none", modelLevel:"none", signs:[], facts:[], lkw:null, lookalikes:[], nextQuestion:null, summary:null, reasonerQuestion:null, droppedCount:0, warnings:[], latency:{null…}, version:0`.

Replacement rule (facts and `lkw`): a new validated item replaces the existing one of the same kind only when its `ref.utteranceId` has a `seq` **greater than or equal to** the existing item's; on equal `seq`, for `lkw` the higher confidence wins (`exact` > `approx` > `vague`), for facts the longer `value` wins; when still tied, the existing item is kept. "Latest" therefore means *said later in the call*, never *processed later* — the reasoner re-reading an old sentence cannot overwrite a newer fact (decision D-17). The reducer needs the utterance list to look up `seq`.

Rendering rule: when `signs.length === 0` the card headline is exactly **"No stroke signs heard yet."** — never "not a stroke", never "low risk".

## 4. Model outputs (what Claude returns — before validation)

These are the `output_config.format` schemas, declared with `.strict()` (an unexpected property fails parsing). Everything in them is untrusted until §7 runs. Keep unions ≤ 16 and optional fields ≤ 24 per request (API limit); every field here is required unless marked nullable.

```ts
// 4.1 Fast pass — claude-haiku-5-5, one caller utterance (+ preceding dispatcher question as context)
export const FastPassOutput = z.object({
  signs: z.array(z.object({ kind: SignKind, quote: z.string() })),
  facts: z.array(z.object({ kind: FactKind, value: z.string(), quote: z.string() })),
});

// 4.2 Reasoner — claude-sonnet-5-5, whole transcript + current state
export const ReasonerOutput = z.object({
  level: Level,
  signs: z.array(z.object({ kind: SignKind, quote: z.string() })),
  last_known_well: z.object({ phrase: z.string(), quote: z.string() }).nullable(),
  blood_thinner: z.object({ value: z.string(), quote: z.string() }).nullable(),
  other_facts: z.array(z.object({ kind: FactKind, value: z.string(), quote: z.string() })),
  lookalikes: z.array(z.object({ name: z.string(), ask: z.string(), quote: z.string().nullable() })),
  next_question: z.object({ kind: NextQuestionKind, text: z.string() }),
  summary: z.string(),              // ≤ 25 words, plain language, no diagnosis wording
});

// 4.3 Q&A — claude-haiku-5-5, neurologist question + transcript + validated facts
export const QaOutput = z.object({
  known: z.boolean(),               // false → the gateway speaks the fallback phrase
  answer: z.string(),               // ≤ 30 words, spoken style
  evidence: z.array(z.object({ quote: z.string() })), // verbatim quotes supporting the answer
});
```

Field name rule: no property named `reasoning`, `rationale`, `thinking` or `steps` (structured-output refusal risk). `quote` fields must be verbatim; the prompts say so and §7 enforces it.

## 5. UI WebSocket — `wss://{gateway}/ws/ui`

Client → server (JSON text frames):

```ts
export const UiClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth"), token: z.string() }),                // first message, always; token from GET /api/ws-token (§6)
  z.object({ type: z.literal("subscribe"), scope: z.literal("call"), callId: Uuid }),
  z.object({ type: z.literal("subscribe"), scope: z.literal("board") }),
  z.object({ type: z.literal("unsubscribe"), scope: z.enum(["call", "board"]), callId: Uuid.optional() }),
  z.object({ type: z.literal("ping") }),
]);
```

Server → client:

```ts
export const CallInfo = z.object({
  id: Uuid, mode: CallMode, callerNumberMasked: z.string().nullable(), startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }).nullable(), status: z.enum(["live","ended","failed"]), timezone: z.string(),
  label: z.string().nullable(),       // "TEST" for smoke-test calls, the script id for replays, null otherwise
});

export const AlertSummary = z.object({
  id: Uuid, callId: Uuid, targetPhoneMasked: z.string(), status: z.enum([
    "queued","calling","ringing","answered","briefed","qa","completed","failed"]),
  briefingText: z.string(), caseSnapshot: CaseState, emsConfirmedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }), lastError: z.string().nullable(),
  qaTurns: z.array(z.object({ seq: z.number().int(), question: z.string(), answer: z.string(), known: z.boolean() })),
});

export const UiServerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth.ok") }),
  z.object({ type: z.literal("error"), code: z.enum(["unauthorized","unknown_call","bad_message"]), message: z.string() }),
  z.object({ type: z.literal("snapshot"), callId: Uuid, call: CallInfo, utterances: z.array(Utterance), state: CaseState, alerts: z.array(AlertSummary) }),
  z.object({ type: z.literal("board.snapshot"), alerts: z.array(AlertSummary) }),
  z.object({ type: z.literal("utterance.partial"), callId: Uuid, speaker: Speaker, text: z.string(), tStartMs: z.number().int() }),
  z.object({ type: z.literal("utterance.final"), callId: Uuid, utterance: Utterance }),
  z.object({ type: z.literal("state.updated"), callId: Uuid, state: CaseState }),
  z.object({ type: z.literal("alert.updated"), alert: AlertSummary }),
  z.object({ type: z.literal("call.ended"), callId: Uuid, endedAt: z.string().datetime({ offset: true }) }),
  z.object({ type: z.literal("alert.removed"), alertId: Uuid }),   // after DELETE /api/alerts/test; board drops the card
  z.object({ type: z.literal("pong") }),
]);
```

Implementation note (D-24): `UiClientMessage` is implemented as `z.union([...])` with the same five shapes, because zod rejects a discriminated union whose two `subscribe` variants share a discriminator value; all contracts use `import { z } from "zod/v4"`.

Rules: the server sends `snapshot` immediately after a `call` subscribe and `board.snapshot` after a `board` subscribe; the client drops any `state.updated` whose `state.version` is lower than the one it holds; `utterance.partial` is replaced in place (one partial line per speaker) and removed when the matching `utterance.final` arrives. Degradation banners are read from `state.warnings` (no separate message). A `replay` call behaves exactly like a live call on the console (its `callerNumberMasked` is null, so the alert modal needs a typed number).

Browser authentication: the browser never holds `INTERNAL_API_KEY`. It calls `GET /api/gateway/ws-token` (the Next.js proxy adds the key) and receives `{token, expiresInS: 600}`; the gateway keeps issued tokens in memory and accepts `{type:"auth", token}` on `/ws/ui` and `?token=` on `/browser/media/:callId` until expiry. Tokens are random 32-byte hex strings; a used token stays valid until expiry (reconnects reuse it).

## 6. REST — `https://{gateway}/api/*` (header `x-internal-key`)

| Method & path | Body | Response | Notes |
| --- | --- | --- | --- |
| `GET /healthz` | — | `{ok, uptimeS, liveCalls, cartesia, version}` | no auth |
| `GET /api/config` | — | `{demoAlertToCaller, featureBrowserMic, featureQa, callTimezone, alertDefaultTargetPhone: E164 | null}` | public flags the web app needs (browser cannot read gateway env) |
| `GET /api/ws-token` | — | `{token, expiresInS}` | §5 browser authentication |
| `GET /api/calls` | — | `{calls: (CallInfo & {level})[]}` | recent 20, all modes |
| `GET /api/calls/:callId` | — | same payload as WS `snapshot` | |
| `POST /api/calls/browser` | `{}` | `{callId, micWsUrl}` | creates a `browser` call; `FEATURE_BROWSER_MIC`; `micWsUrl` includes `?token=` |
| `POST /api/calls/:callId/end` | `{}` | `{ok}` | browser mode only |
| `POST /api/calls/:callId/alert` | `{targetPhone: E164, confirm: true}` | `{alert: AlertSummary}` | 409 if `state.level === "none"`; 409 if an alert for this call is already in `queued..qa` |
| `POST /api/alerts/:alertId/ems-confirm` | `{confirmed: boolean}` | `{alert}` | toggles `emsConfirmedAt` |
| `POST /api/alerts/:alertId/hangup` | `{}` | `{ok}` | ends the briefing call |
| `POST /api/alerts/:alertId/retry` | `{}` | `{alert}` | "Call again": allowed from `calling`, `ringing` or `failed`. If a Twilio call is still in progress it is ended first (`calls(sid).update({status:"completed"})`), then the same number is dialled again with the cached briefing audio; if the cache is gone (gateway restarted) the audio is re-synthesized from `alerts.briefingText`. The same alert row is reused: status back to `calling`, `twilioCallSid` overwritten (the previous sid is logged). 409 from other states. |
| `POST /api/alerts/test-briefing` | `{targetPhone: E164}` | `{alert}` | pre-flight smoke test: creates a `replay` call with `label:"TEST"`, an empty transcript and the canned state `packages/core/src/fixtures/caseState.TEST.json` (level `possible`, one `speech` sign "test one two three", no LKW, no blood thinner), composes and dials it like a real alert |
| `DELETE /api/alerts/test` | — | `{deleted: n}` | deletes alerts (and their calls) whose call has `label:"TEST"` ("Clear test alerts"); drops them from the in-memory registries and broadcasts `alert.removed` for each |
| `POST /api/calls/replay` | `{scriptId: "B01", speed?: 2}` | `{callId}` | feeds an eval script through the live pipeline as a `replay` call with `label: scriptId` (semantics in docs/05 §13) |
| `GET /api/alerts?sinceHours=24` | — | `{alerts: AlertSummary[]}` | board initial load |
| `POST /twilio/voice` | Twilio form | TwiML | signature-validated |
| `POST /twilio/alert-status` | Twilio form | 204 | signature-validated like `/twilio/voice`; `CallStatus` → alert status: `ringing`→`ringing`; `in-progress`→ignored (the media stream's `start` sets `answered`); `completed`→`completed` if the alert reached `answered`, else `failed` ("not answered"); `busy`/`no-answer`/`failed`/`canceled`→`failed` with that reason |
| `WS /twilio/media` | Twilio media stream | — | inbound call, both tracks |
| `WS /twilio/alert-media` | Twilio media stream | — | outbound briefing call, bidirectional |
| `WS /browser/media/:callId?token=` | binary pcm_s16le 16 kHz frames + `{"type":"end"}` | — | token from `/api/ws-token` |
| `WS /ws/ui` | §5 | §5 | |

Errors: `{error: {code, message}}` with 400 (validation), 401 (key/token), 404 (unknown id), 409 (state conflict), 502 (vendor failure, `message` names the vendor). WebSocket upgrades are accepted only from `Origin: http://localhost:3000` (both laptops run the web app locally, docs/01 §7) or with no `Origin` header (Twilio, scripts).

## 7. Quote validator — `packages/core/src/validate/quotes.ts`

This is the gate between models and humans. Input: a candidate `{quote}`, the item's purpose (`"sign"`, a `FactKind`, `"lookalike"`, or `"qa"` with the question text) and the list of `Utterance`s available to the model (for the fast pass: the one caller utterance; for the reasoner and Q&A: the whole transcript). Output: a `QuoteRef` or `null`.

Algorithm:

1. `norm(s)`: NFKC → lowercase → replace curly quotes/dashes with ASCII → remove all characters except `[a-z0-9' ]` → collapse whitespace → trim. (As implemented, apostrophes are removed too so that the "can't"/"cant" test below matches — D-26.) Keep a mapping from normalized positions back to original positions (needed to return the verbatim original substring).
2. Reject if `norm(quote)` has fewer than 3 characters or fewer than 1 word. Reject if the trimmed quote is longer than 160 characters (the prompts ask for the shortest span); log it.
3. **Filter by eligible speaker first**, then search the remaining utterances **newest first**; a quote matches an utterance when `norm(utterance.text).includes(norm(quote))`. Eligible speakers: `caller` and `mixed` for signs, look-alikes and every fact except `address` (either speaker); for Q&A evidence, `caller`/`mixed`, plus `dispatcher` only when the neurologist's question is about the address. Filtering first means a dispatcher echo ("so his right hand is weak?") can never shadow the caller's own words. "About the address" for Q&A = the question matches `/\b(address|where (is|are|do|does)|location|apartment|street)\b/i`.
4. On match, return `{quote: originalSubstring, utteranceId, tMs: utterance.tStartMs, speaker: utterance.speaker}` where `originalSubstring` is the original text span that maps to the matched normalized span (preserves the caller's capitalization and punctuation).
5. No match → `null`. The caller increments `state.droppedCount` and logs `event:"validator.dropped", kind, quote`. A look-alike whose non-null quote fails is **kept** with `ref: null` (the question is still worth asking) and still counts as a drop; every other item is discarded.

Additional rules:

- Fast pass outputs may only quote the utterance they were given. Pass exactly that utterance to the validator.
- The LKW time phrase (`last_known_well.phrase` from the reasoner, `fact.value` for a fast-pass `last_known_well` fact) must itself be a substring of the validated quote (normalized); otherwise drop the item.
- The same span may support two different signs (e.g., "he sounds drunk and keeps falling" → speech and balance); each sign gets its own `QuoteRef`.
- Never "repair" a quote by fuzzy matching. The brief promises verbatim; a near-miss is a drop.

Unit tests (`quotes.test.ts`) must cover: exact match; punctuation/case differences ("He can't lift his coffee cup." vs "he cant lift his coffee cup"); curly apostrophe; quote spanning two utterances (→ drop); dispatcher-only quote for a sign (→ drop); the same words in a **newer dispatcher** utterance and an **older caller** utterance (→ the caller's ref); 2-character quote (→ drop); quote longer than 160 chars (→ drop); match returns original casing; `address` quoted from the dispatcher (→ accepted).

## 8. Level guard — `packages/core/src/validate/levelGuard.ts`

Applied after validation on every reasoner run (and after each fast pass, using the current `modelLevel`):

```
distinctKinds = number of distinct sign kinds among validated signs
if distinctKinds === 0                                        → level = "none"
else if distinctKinds < LIKELY_MIN_DISTINCT_SIGNS (default 2) → level = "possible"
else                                                          → level = max("possible", modelLevel)
```

As implemented (D-27), `likely` additionally needs a focal sign (face, arms, speech) among the kinds, per D-21.

In words: no validated sign → `none`; any validated sign → at least `possible` (the card moves before Sonnet runs; the demo script depends on this, and a quoted sign is evidence the dispatcher should see); `likely` needs two distinct kinds **and** the reasoner saying `likely`. The reasoner can therefore lower `likely` to `possible` but cannot push a card with quoted signs back to `none` — its disagreement shows up as look-alikes and in `summary`, and the quote is on screen for the human to judge. `modelLevel` is kept for the debug readout.

## 9. Next-question ladder — `packages/core/src/state/nextQuestion.ts`

Input: the state (including `state.reasonerQuestion`, the reasoner's latest raw proposal, null until the first reasoner run). Output: `NextQuestion | null`. Runs after every fast pass and every reasoner run. Deterministic: the same state always yields the same banner.

```
if signs.length === 0 → null (banner hidden; normal protocol; level is "none" by the guard)
candidates in order (first that applies wins):
  1. "lkw"           if LKW is not established (definition below)
  2. state.reasonerQuestion if its kind is still open and it is not "none"
  3. "lookalike"     if lookalikes[0] exists and is unresolved (table below)
  4. "blood_thinner" if no blood_thinner fact
  5. the first sign kind not yet in `signs`, in the order face, arms, speech, balance, eyes
  6. null
```

**LKW is established** when `lkw !== null`, `lkw.confidence ∈ {exact, approx}` and `lkw.note ∉ {ampm_assumed, yesterday_assumed}`. Anything else (null, `unknown`, `vague`, or a note needing confirmation) keeps `lkw` at the top of the ladder, with the text variant chosen by the case. This is why "Ask: when was he last seen completely normal?" is always the first banner once a sign is heard (Card A: "Since lunch" is `vague`, so the banner shows the refine variant until "fine at about {T}" arrives).

"Open" means: kind `lkw` → LKW not established; `blood_thinner` → no fact of that kind; `lookalike` → `lookalikes[0]` unresolved; a sign kind → that kind not in `signs`; `onset` → no `onset` fact; `other` → always open; `none` → never.

**Look-alike resolution** (`lookalike.name` → resolved when):

| name | resolved when |
| --- | --- |
| low blood sugar | a `diabetes` fact exists |
| seizure | a `seizure_history` fact exists |
| intoxication | an `alcohol_or_drugs` fact exists |
| migraine | a `migraine_history` fact exists |
| Bell's palsy | any sign of a kind other than `face` exists, or an `onset` fact exists (the panel then reads `Bell's palsy — less likely: other signs heard` when resolved by a sign) |
| head injury | a `head_injury` fact exists |
| infection | a `fever_or_infection` fact exists |
| any other name | never (always open) |

Canonical text (always use these strings; pronouns from the `sex` fact: male → he/his/him, female → she/her/her, unknown → they/their/them; `{hour}` is the 12-hour hour of `lkwAt`):

| kind | text |
| --- | --- |
| lkw (lkw null or confidence unknown) | Ask: when was {he} last seen completely normal? |
| lkw (confidence vague) | Ask: what time exactly was {he} last seen completely normal? |
| lkw (note = ampm_assumed) | Ask: was that {hour} o'clock in the morning, or in the afternoon or evening? |
| lkw (note = yesterday_assumed) | Ask: was that earlier today, or yesterday? |
| blood_thinner | Ask: does {he} take any blood thinners, like Eliquis, Xarelto or warfarin? |
| lookalike | Ask: {lookalike.ask} |
| face | Ask the caller to look at {his} face: is one side drooping or uneven when {he} smiles? |
| arms | Ask: can {he} lift both arms and keep them up? |
| speech | Ask: is {his} speech slurred or are the words mixed up? |
| balance | Ask: is {he} dizzy, unsteady, or falling to one side? |
| eyes | Ask: any sudden trouble seeing — double vision or loss of vision? |
| onset | Ask: did this start suddenly, or did it come on slowly? |
| other | {reasoner text, must start with "Ask"} |

The banner never shows an instruction to the caller, only a question for the dispatcher to ask. If a reasoner `other` text does not start with "Ask", prefix "Ask: ".

## 10. LKW parser I/O (full spec in docs/06)

```ts
export const LkwParseInput = z.object({
  phrase: z.string(),
  saidAt: z.string().datetime({ offset: true }),   // absolute time the phrase was spoken = call.streamStartedAt + utterance.tStartMs (docs/05 §5)
  timezone: z.string(),                             // IANA
});
export const LkwParseOutput = LkwResult.omit({ ref: true, minutesAgo: true });
```

## 11. Briefing composer I/O (docs/05 §7)

```ts
composeBriefing(snapshot: CaseState, now: Date, tz: string, opts: { qaEnabled: boolean }): { text: string; wordCount: number }
```

Pure, deterministic, tested with fixtures A/B/C. Target 45–70 words (≈ 18–25 s at Sonic's default rate).

## 12. Twilio message schemas (`packages/core/src/contracts/twilio.ts`)

Only the fields the gateway reads are required; everything else is optional and passed through, because a vendor adding or omitting a cosmetic field must never stop a call.

```ts
export const TwilioMediaMessage = z.discriminatedUnion("event", [
  z.object({ event: z.literal("connected") }).passthrough(),
  z.object({ event: z.literal("start"), streamSid: z.string(), start: z.object({
    accountSid: z.string(), callSid: z.string(),
    tracks: z.array(z.string()).optional(),
    customParameters: z.record(z.string()).optional(),
    mediaFormat: z.object({ encoding: z.string(), sampleRate: z.number(), channels: z.number() }).passthrough().optional(),
  }).passthrough() }).passthrough(),
  z.object({ event: z.literal("media"), streamSid: z.string(), media: z.object({
    track: z.enum(["inbound","outbound"]).optional(),   // optional for safety; treated as "inbound" when absent
    timestamp: z.string(), payload: z.string(),
  }).passthrough() }).passthrough(),
  z.object({ event: z.literal("mark"), streamSid: z.string(), mark: z.object({ name: z.string() }).passthrough() }).passthrough(),
  z.object({ event: z.literal("dtmf"), streamSid: z.string() }).passthrough(),
  z.object({ event: z.literal("stop"), streamSid: z.string() }).passthrough(),
]);
```

Unknown `event` values are logged at debug and ignored (Twilio may add types). `media.timestamp` is a string of integer milliseconds — parse with `Number()`; a missing `media.track` is treated as `inbound`. A test asserts that the minimal shapes written in docs/01 §4.1 parse.

## 13. Cartesia message schemas (`packages/core/src/contracts/cartesia.ts`, shared by `packages/stt` and the gateway)

```ts
export const InkEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("connected") }).passthrough(),
  z.object({ type: z.literal("turn.start") }).passthrough(),
  z.object({ type: z.literal("turn.update"), transcript: z.string() }).passthrough(),
  z.object({ type: z.literal("turn.eager_end"), transcript: z.string() }).passthrough(),
  z.object({ type: z.literal("turn.resume") }).passthrough(),
  z.object({ type: z.literal("turn.end"), transcript: z.string() }).passthrough(),
  z.object({ type: z.literal("error"), message: z.string(), status_code: z.number().optional(), title: z.string().optional(), error_code: z.string().optional() }).passthrough(),
]);

export const SonicWsEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chunk"), data: z.string(), context_id: z.string().optional(), done: z.boolean().optional() }).passthrough(),
  z.object({ type: z.literal("done"), context_id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("flush_done"), context_id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("timestamps"), context_id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("phoneme_timestamps"), context_id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("error"), message: z.string().optional(), context_id: z.string().optional(), status_code: z.number().optional() }).passthrough(),
]);
```

Unknown `type` values are logged at debug and ignored. A test asserts that the minimal shapes in docs/01 §4.2–§4.3 parse. A Sonic message without `context_id` is attributed to the only open context on that socket (the Q&A loop keeps one at a time).

## 14. Eval script format (`apps/eval/scripts/*.json`, full detail in docs/07 §3)

```ts
export const EvalScript = z.object({
  id: z.string().regex(/^[A-E]\d{2}$/),
  type: z.enum(["classic","chameleon","lookalike","other","hard_audio"]),
  title: z.string(),
  sourceId: z.string().regex(/^[A-D]\d{2}$/).nullable(), // hard_audio re-reads: the script whose turns and truth apply; null otherwise
  callStartLocal: z.string(),        // "2026-10-25T14:47:00" local wall clock for the scenario (LKW math; the virtual "now" in text mode)
  turns: z.array(z.object({ speaker: Speaker, atMs: z.number().int(), text: z.string() })), // empty for hard_audio (copied from sourceId at load)
  truth: z.object({
    isStroke: z.boolean(),
    expectedLevel: Level,            // what a careful reader would set by the end; scored as "level agreement" (docs/07 §1), informational
    signs: z.array(SignKind),        // must be consistent with expectedLevel: likely ⇒ ≥ 2 kinds including one of face/arms/speech (guard §8 + D-21); possible ⇒ ≥ 1
    lkw: z.object({ localTime: z.string(), toleranceMin: z.number().int().positive() }).nullable(), // null = no LKW stated; vague truths use toleranceMin 60
    bloodThinner: z.string().nullable(), // "none" when the caller explicitly denies; null when never mentioned
    lookalike: z.string().nullable(),
    facts: z.array(z.object({ kind: FactKind, value: z.string() })),
  }),
  audio: z.object({ file: z.string(), sampleRate: z.literal(16000), speakerTag: z.enum(["single_mic"]) }).nullable(),
  group: z.enum(["native","non_native","panicked","tv_background"]).default("native"),
});
```

`validate.ts` (task R-01) enforces the cross-field rules in comments above and that `hard_audio` scripts have a `sourceId` and `audio`.
