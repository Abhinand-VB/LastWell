# LastWell — the complete beginner's guide (for the Devpost submission)

This document explains **everything** about LastWell in plain words: what it does, why it matters, every tool we used and what that tool does, how each sponsor track is covered, and ready-to-paste text for Devpost. If a word is unfamiliar, check the **Glossary** at the end.

> Status note (Oct 25, 2026): everything described here works. The four Convex features (section 7) live on the branch `feature/convex` and are switched **off** by default; they reach `main` when the team lands that branch. Items marked **TODO** need a teammate's input.

---

## 1. The 30-second version

When someone calls 911 about a possible stroke, LastWell **listens to the call live**. It:

1. **Writes down** what the caller and the dispatcher say (live transcription).
2. **Spots stroke signs** ("his words come out all mixed up", "he can't lift his arm") and shows each one with the caller's **exact words** as proof.
3. **Works out when the patient was last seen normal**, which is the clock that decides whether the patient can get clot-busting treatment.
4. When the dispatcher clicks **one button**, it **phones the hospital's stroke team** and a natural voice reads them a short briefing, so the hospital can get ready *before* the ambulance arrives.

A human (the dispatcher) approves every alert. LastWell never diagnoses, never says "not a stroke", and never tells the caller what to do.

---

## 2. The problem (why this matters)

**Strokes are a race against the clock.** A stroke happens when blood flow to part of the brain is blocked or a vessel bursts. Every minute, brain cells die. The main emergency treatment for a clot (a clot-busting drug, "tPA") is only allowed within about **4.5 hours** from the moment the patient was **last known well** (LKW). After that window, it's usually too late.

**Two things decide treatment:**
1. **When was the patient last seen completely normal?** (the LKW time)
2. **Is the patient on blood thinners?** (e.g. Eliquis, warfarin; this changes what doctors can safely give)

**The information gets lost.** The 911 caller often says these facts in the first minutes of the call, but today they usually reach the hospital much later, if at all:

- In a US registry of 371,988 patients, paramedics notified the hospital ahead of time for only **67%** of stroke patients brought by ambulance.
- In a survey of 301 EMS workers, **39.5%** named "information lost in dispatch" as a barrier, and only **11%** knew the 4.5-hour window counts from the last-known-well time.
- In a Copenhagen study, human 911 call-takers recognized **52.7%** of strokes on the call (an AI model reached 63.0%).

**Our idea:** start the hospital's preparation **on the 911 call itself**, with the facts the caller already gave, backed by their exact words. We estimate this can reach the stroke team about **7–23 minutes earlier** than a normal pre-alert from the scene (this estimate comes from national EMS response/scene/transport medians; stroke-specific numbers are still to verify).

---

## 3. Who uses it

| Person | What they need | What they see |
|---|---|---|
| **911 dispatcher** | Trustworthy hints, one question at a time, one button to send | The **dispatcher console** (a web page) |
| **On-call stroke team / neurologist** | The two key facts in seconds, hands-free | A **phone call** with a spoken briefing, plus the **stroke-team board** (a web page) |
| **At the judging table** | To pick a case and watch LastWell decide | Teammates play the caller, the dispatcher and the doctor; the judge draws a case card |

---

## 4. What happens on a call — step by step

Here is "Card A", our main demo case. The caller says: *"It's my father, he's 78. Since lunch his words come out all mixed up and his right hand is weak — he can't lift his coffee cup."*

1. **The call comes in.** The caller dials our phone number (provided by **Twilio**). Twilio connects the call to a real person acting as the dispatcher, and at the same time sends us a live copy of the audio from **both sides**.
2. **The words are written down live.** **Cartesia Ink 2** turns each side's speech into text as people talk. Because each side has its own stream, we know who said what (caller vs dispatcher).
3. **Quick scan of every sentence.** Each time the caller finishes a sentence, **Claude Haiku 5.5** (a fast AI model) looks for stroke signs and facts (age, medicines, when it started). It must attach the **exact quote** for everything it finds.
4. **Quote or drop.** Our own code checks every quote against the transcript. If the caller didn't really say those words, the item is **thrown away**. So nothing invented can reach the screen.
5. **Big-picture review.** Every ~10 seconds, or when there's new evidence, **Claude Sonnet 5.5** (a smarter, slower model) re-reads the whole call. It sets the alert level (**none / possible / likely**), lists look-alike conditions (low blood sugar, seizure, migraine…), and suggests the **next question** for the dispatcher (e.g. "Ask: what time exactly was he last seen completely normal?").
6. **Safety guard.** Our code only allows "likely" once at least two different kinds of signs are quoted, one of them face, arm or speech.
7. **The time is computed by code, not AI.** When the caller says "He was fine at about 2 PM", a code parser turns that phrase into a clock time with a range (e.g. "2:00 PM (1:45–2:15 PM)"). AI models can make mistakes with times, so we never let them do this math.
8. **One click to alert.** The dispatcher sees the stroke card, the quotes, the time and the medicine, and clicks **Send stroke pre-alert**.
9. **The stroke team's phone rings.** Our code writes the briefing text from checked facts only. **Cartesia Sonic 3.6** turns it into natural speech, and **Twilio** calls the stroke team's phone. As soon as they answer, the briefing plays.
10. **The board updates.** The stroke-team board shows the alert card with a countdown to the end of the 4.5-hour window, the signs with quotes, and the blood-thinner fact.
11. **(Optional) The doctor can ask questions out loud** on the briefing call ("Is he on blood thinners?"). Claude answers **only** from what was said on the 911 call; if something wasn't mentioned, it says so. This Q&A feature can be switched on or off.

---

## 5. Every tool we used — in plain words

### Sponsor tools

| Tool | What it is (simple) | What it does in LastWell |
|---|---|---|
| **Claude Haiku 5.5** (Anthropic) | A fast AI language model | Reads each caller sentence and pulls out stroke signs and facts, each with an exact quote |
| **Claude Sonnet 5.5** (Anthropic) | A smarter AI model that thinks more carefully | Re-reads the whole call: sets the level, lists look-alikes, suggests the next question |
| **Cartesia Ink 2** | Speech-to-text (turns voice into text) live | Transcribes the caller and the dispatcher in real time, two separate streams |
| **Cartesia Sonic 3.6** | Text-to-speech (turns text into a natural voice) | Speaks the briefing to the stroke team on the phone (and answers questions if Q&A is on) |
| **Convex** | A cloud database that also runs server code and pushes updates to screens live | Saves every call, alert and transcript line; powers the live board, stored audio, rate limit (section 7) |

### Other tools

| Tool | What it is | What it does in LastWell |
|---|---|---|
| **Twilio** | A phone-call service for programmers | Gives us a real phone number, connects caller and dispatcher, streams the call audio to us, places the outbound briefing call |
| **ngrok** | Gives a laptop a public internet address | Lets Twilio (on the internet) reach our gateway running on a laptop |
| **Node.js + Fastify** | A way to run JavaScript servers | Runs the **gateway**: the "engine room" connecting Twilio, Cartesia, Claude and Convex |
| **Next.js (React)** | A framework for building web pages | Builds the dispatcher console and the stroke-team board |
| **TypeScript** | JavaScript with type checks | The whole project is TypeScript (one language, fewer mistakes) |
| **zod** | A checker for data shapes | Checks every message, every AI answer and every setting before we trust it |
| **pnpm** | A package manager | Installs libraries and runs our scripts and tests |
| **Vitest** | A testing tool | Runs our automated tests (hundreds of them) |

### Our own code pieces (the "brains" that are NOT AI)

| Piece | What it does |
|---|---|
| **Quote validator** | Drops anything the AI says that isn't backed by the caller's real words |
| **Level guard** | Stops the alert from jumping to "likely" without enough evidence |
| **LKW parser** | Turns phrases like "fine at about 2 PM" or "since lunch" into a clock time and range |
| **Briefing composer** | Writes the spoken briefing from checked facts only (the AI doesn't write it) |
| **Keyword baseline** | A simple "look for stroke words" alarm, used as a comparison in our evaluation |
| **Audit trail** | Records every dispatcher action, level change and alert status for each call, so anyone can review exactly what happened and why |

---

## 6. Safety and responsibility (what LastWell never does)

- **Never says "not a stroke."** When nothing is heard, the card says *"No stroke signs heard yet."*
- **Never dispatches ambulances, changes call priority, or gives medical instructions** to the caller.
- **A human approves every alert.** The dispatcher clicks the button; the alert is labeled "Dispatcher pre-alert" until paramedics confirm.
- **Quote or drop:** every sign and fact shown to a person comes with the caller's exact words and the time in the call they said it.
- **Times are computed by code,** never by the AI.
- **Calls only allowed numbers:** the system refuses to call any number not on an approved list.
- **No audio is stored** in phone mode; demo transcripts are wiped after the event.
- **No secrets in the code:** API keys are kept outside the repository, and an automatic scan checks every change.

---

## 7. Convex — what it does here (detailed)

**Convex in one sentence:** a cloud database plus server functions that **automatically push changes to every open screen**. A screen asks once ("show me the alerts") and Convex keeps it up to date by itself.

### What Convex does in LastWell

1. **Stores every call (always on).** The gateway writes the call, each transcript line, the stroke card (signs, quotes, LKW time), every alert and every Q&A turn into Convex as they happen. After a restart, history comes back from Convex.

The next four are new features built for the Convex track. They are **switched off by default** so the main demo is unchanged, and they're turned on with settings (`FEATURE_CONVEX_BOARD`, `NEXT_PUBLIC_BOARD_LIVE=convex`, `CONVEX_AUDIO_STORAGE`, `CONVEX_CALL_RATE_LIMIT`).

2. **Live stroke-team board (live queries).** The board **subscribes** to a Convex query. When the dispatcher sends an alert, or its status changes (calling → ringing → answered → briefed → completed), Convex pushes the change to the board instantly. No refresh, no polling.
3. **Live evidence page (live queries).** Each board card has a "Live evidence →" link to a page showing only the **quoted** stroke signs, facts and last-known-well time for that call. It updates **while the caller is still talking**. For privacy, it never shows the full transcript, phone numbers or the address, and only exists for calls that were actually sent to the stroke team.
4. **Briefing audio in Convex file storage.** The briefing audio Sonic creates is uploaded to Convex storage and linked to the alert. If the gateway restarts, "Call again" and "Play briefing" replay the stored audio instead of generating it again.
6. **Board history export (Convex pagination).** An "Export history (24 h)" button on the board downloads all alerts from the last 24 hours as a spreadsheet file (CSV): level, briefing status, paramedic confirmation, last-known-well time and blood thinner with their quotes, and the quoted signs. Convex hands the data over page by page (its built-in pagination). The privacy rules match the evidence page: no transcript, phone numbers or address. Useful for a stroke team's shift handover or a quality review.
5. **Call rate limit (Convex component).** The official `@convex-dev/rate-limiter` component allows **at most 3 alert calls per phone number per 10 minutes**, on top of the allowed-numbers list. If a bug or a stuck button tried to keep calling a doctor, the 4th call is refused ("Rate limit reached… try again in N s").

### How the security works (simple)

- The browser **never** gets our master key.
- Instead, the gateway gives the board a **10-minute pass** (a random token stored in Convex).
- When the pass expires, a **scheduled Convex function deletes it**. Because the board's live query depended on that pass, Convex instantly re-runs it and every screen using the old pass gets "unauthorized" instead of data. The board quietly fetches a new pass before that happens.
- We tested this for real: a subscription held open for 600 seconds received "unauthorized" exactly at the 600-second mark, with no action from the client.

### Convex features used (for the track judges)

| Convex feature | Where |
|---|---|
| **Live queries** (`useQuery`, reactive subscriptions) | Stroke-team board, live evidence page |
| **Components** (`@convex-dev/rate-limiter`) | Per-number outbound call limit |
| **File storage** (`generateUploadUrl`, `storage.getUrl`) | Briefing audio |
| **Scheduled functions** (`scheduler.runAt`) | Token expiry that cuts off live screens |
| **Pagination** (`paginationOptsValidator`, `.paginate()`) | Board history export (CSV) |
| **Database + indexes + transactions** | All call, alert, transcript and token data |
| **convex-test** | Automated tests of every function, including security cases |

---

## 8. Results (how well it works)

We wrote **20 test calls** (12 strokes, including "chameleons" — strokes that don't look like strokes; 5 look-alike conditions; 3 other emergencies) and compared LastWell with a simple keyword alarm like the ones general 911 software uses.

| What we measured | LastWell | Keyword alarm |
|---|---|---|
| Strokes flagged at "possible" (12 strokes) | **12/12 (100%)** | 3/12 (25%) |
| Strokes flagged at "likely" | 7/12 (58%) | — |
| When it said "likely", was it right? | **7/7 (100%)** | — |
| Last-known-well time correct | **16/16** | — |
| Blood thinner correct | **8/8** | — |
| **Invented facts shown** | **0** | — |
| Median time to first flag | 12 s | 12 s |

**Through real speech recognition:** 6 scripts spoken by Sonic in three styles (calm, accented, panicked), sent as phone audio through Ink 2: all strokes flagged in every voice, LKW 6/6, blood thinner 3/3, 0 invented facts.

**Honest note:** these are calls we wrote, not real 911 recordings, so real-world numbers will be lower.

---

## 9. Sponsor tracks — how each one is covered

### 9.1 [Anthropic] Claude for Public Benefit ($4,998 + Claude credits)

| Criterion | How LastWell meets it |
|---|---|
| **A named community** | **911 dispatchers taking possible-stroke calls, and the on-call stroke teams at the hospitals they send patients to.** (Use this exact wording, not "healthcare".) |
| **A real problem you lived or heard about** | Information about stroke patients gets lost between the 911 call and the hospital (39.5% of EMS workers name it as a barrier). **TODO:** add a quote from a dispatcher, paramedic, nurse or neurologist the team talked to. |
| **It works** | Live phone call → transcript → stroke card with quotes → one click → doctor's phone rings with the briefing. Tested end to end. |
| **Thoughtful use of Claude, and knowing where it could go wrong** | Haiku does fast extraction, Sonnet does careful review. We know Claude could invent a fact or get a time wrong, so: every item must quote the caller exactly or it's dropped; times are computed by code; the briefing is written by code; a human approves every alert; it never says "not a stroke". |

### 9.2 [Cartesia] Best Use of Cartesia ($1,516)

| Criterion (25% each) | How LastWell meets it |
|---|---|
| **Problem & originality** | A clear, narrow, life-or-death use case: getting stroke facts from a 911 call to the hospital faster. |
| **Use of Cartesia** | Voice is the **core** in both directions. Ink 2 hears the call (two live streams, medical keyterms like drug names, phone-quality audio taken as-is, turn detection). Sonic 3.6 speaks the briefing on a real phone call (and can answer questions). Without Cartesia there is no product. |
| **Execution** | The main flow works end to end; edge cases handled: dropped transcription connection reconnects once then shows a warning banner; a browser-microphone fallback if the phone line fails; the briefing audio is prepared before the doctor answers so there's no wait. |
| **Impact & responsibility** | No audio stored in phone mode; human approval; calls only allowed numbers; honest limits stated. |

**Submission checklist:** working demo ✓ · 2-minute demo-first presentation ✓ (the runbook's script starts with the demo) · README with setup, Cartesia features, known limits ✓ · source access with no keys in the repo ✓.

### 9.3 [Microsoft] Built for the Real World / Customer Impact Award

| Criterion | How LastWell meets it |
|---|---|
| **Customer understanding** | Built around the real workflow of a 911 dispatcher (one question at a time, one button) and an on-call neurologist (two facts, hands-free, in seconds). |
| **Measurable usefulness** | 12/12 strokes flagged vs 3/12 for keywords; 0 invented facts; LKW 16/16; blood thinner 8/8. |
| **Path from prototype to production** | **Add this paragraph** (draft in section 11). |
| **Responsible design** | Human-in-the-loop, quote-or-drop, code-computed times, never "not a stroke", audit trail of every action. |
| **End-to-end functionality** | Real phone call in, real phone call out, two live web screens. |

They ask for an "AI agent": describe LastWell as **an agent that listens, reasons, and drafts the alert, with a human approving the action**.

### 9.4 [Convex] Best use of Convex ($5,000)

The track says: *"Use real Convex features like live queries and components to win."* We use **live queries** (board + evidence page), a **component** (rate limiter), **file storage** (briefing audio) and **scheduled functions** (token expiry). Full details in section 7.

To be judged: the `feature/convex` branch must be on GitHub (landed on `version1`, then `main`), and someone must show it running (from the laptop where it already works, or a Convex deployment with the switches on).

### 9.5 Cal Hacks prizes

| Prize | Why we fit |
|---|---|
| **Best People-First Social Impact Hack** | Faster stroke care means less brain damage and fewer deaths; designed around the people involved (caller, dispatcher, doctor). |
| **Most Technically Complex Hack** | Live phone audio, two transcription streams, two AI models with validation, a time parser, a voice call back out, a live database. |
| **Hacker's Choice / Overall** | Judged from the same submission. |

### 9.6 Tracks we skip (and why)

Gemini, Solana, Tiger Data, Vultr, Snowflake, Fetch.ai, Factory, Apify, Creao, Bitdeer, Elastic, Nessie, CRS, Moss, SpaceXSI/Cursor, x402, Notability, Spacetime, Mana, Bright Data, Atlassian: each requires a tool we don't use. Beginner, Hardware, Planet-First, Solo, Security, Visa, Hyphenate: don't fit. GoDaddy only if someone registers a domain; Figma only if we actually designed in Figma. **Optional:** [MLH] Commit Fellowship (opt in **and** fill the supplemental form) and [Meta] (weak fit).

---

## 10. How to run the demo (for judges)

**The story (2 minutes, demo first):**
1. The judge draws a case card. A teammate calls our number and reads it as the caller; another teammate answers as the dispatcher.
2. On the **console**, the transcript appears live; the stroke card turns **Likely** with quoted signs; the facts show the LKW time and Eliquis.
3. The dispatcher clicks **Send stroke pre-alert**.
4. The "doctor" teammate's phone rings and Sonic reads the briefing.
5. The **board** shows the alert card with the countdown (and, for the Convex demo, it updates live from Convex).
6. Then: the problem in one sentence, how we built it, the results table.

**For the Convex judges (30 seconds each):**
- *Live board:* send an alert → the card appears on the board instantly; statuses tick by live.
- *Live evidence:* send early, keep the caller talking, open "Live evidence →": new quotes appear as they're spoken.
- *Storage:* show the briefing file in the Convex dashboard; restart the gateway; press "Call again" → same audio, no new synthesis.
- *Rate limit:* press "Send test briefing" 4 times → the 4th is refused.

---

## 11. Ready-to-paste Devpost text (edit as needed)

**Inspiration**
> When someone has a stroke, every minute costs brain cells, and the main clot-busting treatment is only allowed within 4.5 hours of when the patient was last seen normal. The 911 caller often says exactly what the hospital needs (when it started, what medicines the patient takes) in the first minutes of the call, but that information usually reaches the stroke team late or not at all. **TODO: one-sentence quote from a dispatcher, paramedic or clinician we talked to.**

**What it does**
> LastWell listens to a 911 medical call, flags a possible stroke and backs every flag with the caller's exact words. It works out when the patient was last seen normal, using code, not AI. With one click from the dispatcher, it calls the on-call stroke team and a natural voice reads them a short briefing, so the hospital can prepare before the ambulance arrives. A live board shows every alert with a countdown to the treatment window.

**How we built it**
> Twilio streams both sides of the call to our Node.js gateway. Cartesia Ink 2 transcribes each side live. Claude Haiku 5.5 extracts stroke signs and facts from every caller sentence, each with a verbatim quote; our quote validator drops anything the caller didn't say. Claude Sonnet 5.5 re-reads the whole call to set the level and suggest the next question. A deterministic parser computes the last-known-well time. On approval, code composes the briefing, Cartesia Sonic 3.6 voices it, and Twilio calls the stroke team. Convex stores everything and powers the live stroke-team board with live queries, file storage for the briefing audio, a rate-limiter component and scheduled token expiry. The web app is Next.js; everything is TypeScript with zod validation at every boundary.

**Challenges we ran into**
> Making AI output safe enough to show a doctor (solved with quote-or-drop and code-computed times); keeping latency low on a live phone call (a fast model for every sentence, a careful model in the background, briefing audio prepared before the doctor answers); phone-quality audio; and building a fallback for when the phone line fails.

**Accomplishments that we're proud of**
> 12 of 12 test strokes flagged versus 3 of 12 for a keyword alarm, zero invented facts, and last-known-well correct 16 of 16 — on a real phone call, end to end, with a human approving every alert.

**What we learned**
> Where AI should and shouldn't decide: models are great at reading messy speech, but times, the final briefing and the decision to alert stay with code and humans.

**What's next — path to production** (also for Microsoft)
> Pilot with one dispatch center, tested on real (de-identified) 911 recordings with clinical review; integrate with dispatch software (CAD) and hospital stroke-alert systems instead of a separate screen; meet health-privacy requirements (HIPAA, business associate agreements) and add proper sign-in and roles; monitor accuracy and latency continuously, with the audit trail for every call; and measure the real effect on door-to-needle time.

**Built with**
> claude-api, anthropic, cartesia, twilio, convex, next.js, react, typescript, node.js, fastify, zod, ngrok, vitest

---

## 12. Honest limits (say these out loud — judges respect it)

- **Scripted calls, not real 911 audio.** Real-world numbers will be lower.
- **Not a medical device.** LastWell suggests and quotes; people decide.
- **Teammates play the roles** at the judging table.
- **Browser-microphone fallback** hears both people on one mic, so it can't tell who is speaking.
- **No SMS:** US carriers block messages from unregistered numbers, so the alert is a phone call.
- **Demo-grade security:** one shared internal key; not for public deployment as is.
- **Signs are never removed:** if the caller corrects themselves, the earlier sign stays, and both sentences are visible in the transcript.
- **"He"/"she" alone doesn't set the patient's sex;** words like "my father" do.

---

## 13. Devpost checklist

- [ ] Project image, GitHub link, demo video, all teammates added
- [ ] Tracks ticked: **Claude for Public Benefit**, **Cartesia**, **Microsoft** (both), **People-First Social Impact**, **Most Technically Complex**, Hacker's Choice; **Convex** if landed
- [ ] Named community wording (Anthropic) and interview quote (**TODO**)
- [ ] "Path to production" paragraph (Microsoft)
- [ ] Convex: branch landed on `version1`; switches on for the Convex demo
- [ ] Submit by **9:00 AM PT** (aim for 8:00); team checked in by 8:00 AM

---

## 14. Glossary

| Word | Meaning |
|---|---|
| **Stroke** | Blood flow to part of the brain is blocked (or a vessel bursts); brain cells start dying |
| **BE-FAST** | Stroke warning signs: Balance, Eyes, Face, Arms, Speech, Time |
| **LKW (last known well)** | The last time the patient was seen completely normal; the 4.5-hour treatment clock starts here |
| **tPA** | The clot-busting drug used for strokes caused by a clot |
| **Blood thinner** | Medicine like Eliquis or warfarin; changes what treatment is safe |
| **Look-alike (mimic)** | Something that looks like a stroke but isn't (low blood sugar, seizure, migraine…) |
| **Chameleon** | A stroke that doesn't look like one (dizziness, confusion) |
| **Dispatcher** | The 911 call-taker |
| **Pre-alert** | Telling the hospital a stroke patient is coming, before arrival |
| **Transcription / STT** | Turning speech into text |
| **TTS** | Turning text into speech |
| **Gateway** | Our server program in the middle that connects all the services |
| **Console** | The dispatcher's web page |
| **Board** | The stroke team's web page |
| **Live query** | A Convex feature: a screen subscribes once and gets every change pushed to it automatically |
| **Component** | A ready-made Convex building block (here: the rate limiter) |
| **Rate limit** | A cap on how often something can happen (here: 3 calls per number per 10 minutes) |
| **Token** | A temporary pass that proves the board is allowed to read data |
| **Feature flag / switch** | A setting that turns a feature on or off without changing code |
| **Quote or drop** | Our rule: anything shown must quote the caller's exact words, or it's removed |
| **Human in the loop** | A person approves the important action (here: sending the alert) |
