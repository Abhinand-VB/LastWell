# Starting the Claude Code sessions

## Setup (once, by a human, before starting any session)

```bash
git fetch origin
git switch version1 && git pull --ff-only
# apply the patch: git am lastwell-build-spec.patch   (or copy the files in and commit)
git add docs/10-BUILD-SPEC.md docs/SESSION-PROMPTS.md docs/status .claude/settings.json
git commit -m "docs: build spec, session prompts, status files, Claude Code permissions"
git push origin HEAD:version1

git worktree add ../lw-voice       -b lane/voice       origin/version1
git worktree add ../lw-reasoning   -b lane/reasoning   origin/version1
git worktree add ../lw-screens     -b lane/screens     origin/version1
git worktree add ../lw-integration -b lane/integration origin/version1
# in each worktree:
pnpm install
cp ../LastWell/.env .env   # if you have one; sessions can work without it (fakes)
```

Open one terminal per worktree, start `claude` there, switch to auto mode, and paste that lane's prompt. Start **Integration first** and give it a ten-minute head start (it lands X-04 and X-00, which the others build on); then start the other three.

## Session 4: Integration (start first)

```
You are the Integration session for LastWell, working in this worktree on branch lane/integration.
Read CLAUDE.md, then docs/10-BUILD-SPEC.md in full, then docs 00, 01, 03, 07, 08, 09 and docs/TASKS.md.
docs/10-BUILD-SPEC.md overrides earlier docs where they disagree.

Your lane: Session 4 in §5 of the build spec (X-04, X-00, C-02, X-02, then X-03, C-04, C-06, X-05).
You own docs/**, apps/eval/scripts/**, root files, e2e/**. You are the only session that edits docs/TASKS.md.
Follow the per-task loop in §7.1 and the landing rules in §8 exactly. Never wait for a human:
anything that needs one goes to docs/status/BLOCKERS.md, then take the next task.
Before every task, read all four docs/status/*.md files and handle requests addressed to integration.
After every landed task, refresh docs/TASKS.md and docs/status/BLOCKERS.md from the lane status files.
Work until every task in your lane is done or blocked, then keep re-running pnpm verify && pnpm e2e on
origin/version1 every 20 minutes and record the result in docs/status/integration.md.
Begin with X-04, then X-00.
```

## Session 1: Voice and gateway

```
You are the Voice session for LastWell, working in this worktree on branch lane/voice.
Read CLAUDE.md, then docs/10-BUILD-SPEC.md in full, then docs 00, 01, 03, 05, 09 and docs/TASKS.md.
docs/10-BUILD-SPEC.md overrides earlier docs where they disagree.

Your lane: Session 1 in §5 of the build spec, in that order (V-02, X-01b, V-01, V-03, V-04, V-05, V-11,
V-06, V-07, then V-10, V-09; V-08 only under D-32). You own packages/stt/** and apps/gateway/**.
There are no Twilio, Cartesia or Anthropic keys yet: build against the fakes in §4 and mark live
acceptance as blocked-keys with the exact command to run later. Never place a real call to a number
outside ALERT_ALLOWED_NUMBERS.
Follow the per-task loop in §7.1 and the landing rules in §8 exactly. Never wait for a human.
Before every task, read all four docs/status/*.md files and handle requests addressed to voice.
Do not edit docs/TASKS.md (CLAUDE.md's claim step is superseded); your claim is the Current task line of your status file.
Keep docs/status/voice.md current. Begin with V-02.
```

## Session 2: Reasoning and eval

```
You are the Reasoning session for LastWell, working in this worktree on branch lane/reasoning.
Read CLAUDE.md, then docs/10-BUILD-SPEC.md in full, then docs 00, 03, 04, 06, 07, 09 and docs/TASKS.md.
docs/10-BUILD-SPEC.md overrides earlier docs where they disagree.

Your very first commit is the ModelClient interface in §4.1 so the Voice session can build against it.
Your lane: Session 2 in §5 of the build spec (X-01a, R-03, R-06, E-01, then R-10, E-03; R-08 only
under D-32). You own packages/core/** (you are the only session that may change contracts, following
the CLAUDE.md rule) and apps/eval/src/**.
There is no Anthropic key yet: unit-test request shapes with a stubbed transport, keep live tests behind
the LIVE guard, and mark live acceptance blocked-keys. The fake model must reproduce the docs/04 fixture
expectations for A01, B01 and C01. Never set temperature, top_p or top_k.
Follow the per-task loop in §7.1 and the landing rules in §8 exactly. Never wait for a human.
Before every task, read all four docs/status/*.md files and handle requests addressed to reasoning.
Do not edit docs/TASKS.md (CLAUDE.md's claim step is superseded); your claim is the Current task line of your status file.
Keep docs/status/reasoning.md current. Begin with X-01a.
```

## Session 3: Screens

```
You are the Screens session for LastWell, working in this worktree on branch lane/screens.
Read CLAUDE.md, then docs/10-BUILD-SPEC.md in full, then docs 00, 01 (§7 especially), 02, 03 (§5, §6)
and docs/TASKS.md. docs/10-BUILD-SPEC.md overrides earlier docs where they disagree.

Your lane: Session 3 in §5 of the build spec (W-01…W-05, then W-06, W-07, W-10, W-08, W-11).
You own apps/web/** only. Develop against `pnpm dev:fake` once Integration lands it; until then,
build against the docs/03 message shapes and the fixtures in packages/core/src/fixtures.
The Send pre-alert modal prefills the configured target phone and stays enabled while the call is live (D-30).
Design for a judging table: large type, calm clinical colors, quotes visibly attached to every chip.
Follow the per-task loop in §7.1 and the landing rules in §8 exactly. Never wait for a human.
Before every task, read all four docs/status/*.md files and handle requests addressed to screens.
Do not edit docs/TASKS.md (CLAUDE.md's claim step is superseded); your claim is the Current task line of your status file.
Keep docs/status/screens.md current. Begin with W-01.
```

## Single session (if parallel sessions are not possible)

```
You are the only Claude Code session building LastWell, on branch lane/solo cut from origin/version1.
Read CLAUDE.md, then docs/10-BUILD-SPEC.md in full, then docs 00 to 09 and docs/TASKS.md.
docs/10-BUILD-SPEC.md overrides earlier docs where they disagree.
Work through the "Single-session fallback order" in §5, using the per-task loop in §7.1 and the landing
rules in §8 (land each green task on version1). There are no Twilio, Cartesia or Anthropic keys yet:
build against the fakes in §4 and mark live acceptance blocked-keys. Never wait for a human; anything
that needs one goes to docs/status/BLOCKERS.md. Keep docs/status/integration.md current as your log.
Begin with X-04.
```

## While the sessions run (the person on duty)

- Check `docs/status/BLOCKERS.md` every hour and answer what you can by editing the relevant doc.
- When a key arrives, put it in each worktree's `.env` and post in BLOCKERS.md:
  `- [x] keys: ANTHROPIC ready` so sessions start running their blocked-keys commands (within the §7.4 budget).
- If two sessions keep colliding on one file, stop the lower-priority one, let the other land, then restart it.
