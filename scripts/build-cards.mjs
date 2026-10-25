#!/usr/bin/env node
// pnpm cards — builds docs/cards/cards.html, the printable demo deck (task C-04, decision D-31).
// Fronts are hand-written lay facts for the caller teammate; backs (sealed) are generated from each
// script's truth in apps/eval/scripts, so the answer key cannot drift from the scored scripts.
// Print duplex, "flip on long edge": every card is one sheet, front on the odd page, back on the even.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = join(ROOT, "apps", "eval", "scripts");
const OUT = join(ROOT, "docs", "cards", "cards.html");

// LKW blank (D-20): the presenter writes the half-hour mark about one hour before now, right before handing the card over.
const BLANK = "______";

// pile: "stroke" = the 4-card stroke pile; "deck" = the 12-card full deck.
const CARDS = [
  { id: "A01", pile: "stroke", who: "You are calling about your father.", lines: [
    "Say: “It’s my father, he’s 78. Since lunch his words come out all mixed up and his right hand is weak — he can’t lift his coffee cup.”",
    `If asked when he was last normal: “He was fine at about ${BLANK}.”`,
    "If asked about medicines: “He takes Eliquis.”",
    "Address: 1842 Clement Street, apartment 3." ] },
  { id: "A02", pile: "stroke", who: "You are calling about your husband, 71.", lines: [
    "His face is drooping on the left side and his speech is slurred — you can barely understand him.",
    "He is awake, sitting at the kitchen table.",
    `If asked when he was last normal: “He was fine at about ${BLANK}.”`,
    "If asked about blood thinners: “No, just his blood pressure pills.”",
    "Address: 455 Noriega Street." ] },
  { id: "A05", pile: "deck", who: "You are calling about your wife, 75.", lines: [
    "All of a sudden she can’t see out of her right eye — it just went dark.",
    "Her left hand is numb and weak; she can barely squeeze your fingers.",
    `If asked when she was last normal: “She was fine at about ${BLANK}.”`,
    "If asked about blood thinners: “She takes a baby aspirin every day.”",
    "Address: 3301 Irving Street." ] },
  { id: "A06", pile: "deck", who: "You are a caregiver at a care home, calling about Mrs. Lee, 88.", lines: [
    "She understands you and nods, but she can’t say any words — nothing comes out.",
    "Her right arm is limp; she can’t hold her cup with it at all.",
    `If asked when she was last normal: “She was fine at about ${BLANK}.”`,
    "If asked about blood thinners: “Yes, she’s on Xarelto.”",
    "Address: Sunset Care Home, 2650 Great Highway, room 12." ] },

  // Every card's script matched its truth level (final and peak) in the live E-03 run 1. A03 ended
  // Possible live (expected Likely) and C03 touched Likely mid-call, so both stay out; C04 passed.
  { id: "A04", pile: "deck", who: "You are a neighbor. You just found the man downstairs, about 69, on his kitchen floor.", lines: [
    "He is awake, but his speech is all garbled — you can’t understand a word.",
    "The right side of his mouth is hanging down.",
    "If asked when he was last normal: “I don’t know. I just found him like this.” (No time blank: you really don’t know.)",
    "If asked about medicines: “No idea, sorry.”",
    "Address: 37 Kirkham Street, the downstairs unit." ] },
  { id: "A07", pile: "deck", who: "You are calling about your dad, 66.", lines: [
    "He suddenly got very dizzy — the room is spinning — and he’s seeing two of everything.",
    "He tried to get up and can’t walk; he almost fell over.",
    `If asked when he was last normal: “He was fine at about ${BLANK}.”`,
    "If asked about blood thinners: “No, he doesn’t take anything like that.”",
    "Address: 88 Judah Street." ] },
  { id: "B01", pile: "stroke", who: "You are calling about your wife, 74.", lines: [
    "She’s dizzy, keeps bumping into the wall, and says she sees double. You think she’s just tired.",
    "If asked to have her smile: her face looks normal. If asked about her arms: both are fine. She just can’t walk straight.",
    `If asked when she was last normal: “She was fine at about ${BLANK}.”`,
    "If asked about blood thinners: “No, nothing like that.”",
    "Address: 530 Ulloa Street." ] },
  { id: "B02", pile: "deck", who: "You are calling about your father, 70.", lines: [
    "He sounds drunk — his words are all mixed up and don’t make sense.",
    "But he doesn’t drink at all. That’s why it’s so weird.",
    `If asked when he was last normal: “He was fine at about ${BLANK}.”`,
    "If asked about medicines: you don’t know.",
    "Address: 742 Lincoln Way." ] },
  { id: "B04", pile: "deck", who: "You are calling about your sister, 68. You are not with her; you just spoke to her on the phone.", lines: [
    "She sounds weird on the phone — her words won’t come out; she keeps trying and stopping.",
    `If asked when she was last normal: “We talked at ${BLANK} and she was fine.”`,
    "She lives alone. You don’t know her medicines.",
    "Her address: 19 Vicente Street." ] },
  { id: "B06", pile: "stroke", who: "You are calling about your wife, 72.", lines: [
    "She suddenly can’t see anything on her left side, and keeps bumping into the furniture. Maybe it’s her glasses?",
    "She is awake and talking, just upset.",
    `If asked when she was last normal: “She was fine at about ${BLANK}.”`,
    "If asked about blood thinners: “No, she doesn’t.”",
    "Address: 560 Cabrillo Street." ] },
  { id: "C01", pile: "deck", who: "You are calling about your husband, 68.", lines: [
    "He’s diabetic, he skipped dinner, and now he’s sweaty and confused. He’s mumbling and shaky.",
    "If asked about insulin: “Yes, he took his insulin and then he didn’t eat anything.”",
    "If asked when he was last normal: “About an hour ago, he was fine.”",
    "Address: 2210 Taraval Street." ] },
  { id: "C02", pile: "deck", who: "You are calling about your son, 34.", lines: [
    "He was shaking and jerking all over for about a minute. Now he’s stopped, but he’s confused and not talking.",
    "If asked whether this happened before: “Yes, he has epilepsy.”",
    "If asked when he was last normal: “Ten minutes ago, right before the shaking started.”",
    "Address: 250 Ocean Avenue." ] },
  { id: "C04", pile: "deck", who: "You are calling about your wife, 45.", lines: [
    "She started seeing flashing lights, then her right hand went numb, and now she has a bad headache.",
    "She gets migraines: “She says it’s her usual migraine, but worse.” It came on slowly. No fever.",
    "If asked when she was last normal: “About an hour ago, before the lights started.”",
    "Address: 915 Clayton Street." ] },
  { id: "D01", pile: "deck", answer: "NOT A STROKE — a heart attack picture (other emergency)", who: "You are calling about your husband, 58.", lines: [
    "He has crushing pain in his chest, he’s sweating a lot, and the pain is going down both arms.",
    "He is awake and talking normally, breathing fast, scared and pale.",
    "If asked when it started: “About fifteen minutes ago, when he was getting dressed.”",
    "Address: 4410 Anza Street." ] },
  { id: "D04", pile: "deck", answer: "NOT A STROKE — an allergic reaction (face swelling is not a droop)", who: "You are calling about your friend, 40, at a restaurant.", lines: [
    "She ate some shrimp and now her lips and face are swelling up, and she’s itchy all over.",
    "Her throat feels a little tight, but she’s breathing. She’s awake and talking, just scared.",
    "She didn’t know she was allergic to shellfish.",
    "Address: Golden Wave restaurant, 520 Clement Street." ] },
  { id: "C05", pile: "deck", who: "You are calling about your dad, 60.", lines: [
    "The right side of his face is droopy, he can’t close his right eye all the way, and his ear hurts.",
    "It started yesterday: “He was fine yesterday morning.”",
    "His arms are fine, he’s talking fine and walking around normally. Nothing else.",
    "Address: 2041 Balboa Street." ] },
];

const ANTIPLATELET = /aspirin|clopidogrel|plavix|ticagrelor|brilinta/i;
const SIGN_LABEL = { balance: "B balance", eyes: "E eyes", face: "F face", arms: "A arms", speech: "S speech" };
const ORDER = ["balance", "eyes", "face", "arms", "speech"];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function back(card, s) {
  const t = s.truth;
  const answer = card.answer ?? (t.isStroke
    ? `STROKE — ${s.type === "chameleon" ? "a chameleon (atypical stroke)" : t.expectedLevel === "possible" ? "a posterior stroke (dizziness and double vision)" : "classic picture"}`
    : `NOT A STROKE — look-alike: ${t.lookalike}`);
  const level = { likely: "Likely", possible: "Possible", none: "None (“No stroke signs heard yet.”)" }[t.expectedLevel];
  const chips = [...t.signs].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map((k) => SIGN_LABEL[k]).join(" · ") || "none";
  const hasBlank = card.lines.some((l) => l.includes(BLANK));
  const lkw = t.lkw === null
    ? t.expectedLevel === "none" ? "not needed: no stroke signs, so no banner asks for it" : "unknown — the banner keeps asking when the patient was last seen normal"
    : hasBlank ? "the time written on the front, with its range (±15 min)" : "from the caller’s words on the front, as a clock time with a range";
  const thinner = t.bloodThinner === null ? "not mentioned" : t.bloodThinner === "none" ? "none (caller says no)" : t.bloodThinner;
  const rows = [
    ["Answer", answer],
    ["LastWell should show", `Level: <b>${level}</b>`],
    ["BE-FAST chips", chips],
    ["Last known well", lkw],
    // D-41(c): an antiplatelet is named as such, never called a blood thinner.
    [ANTIPLATELET.test(t.bloodThinner ?? "") ? "Antiplatelet" : "Blood thinner", thinner],
  ];
  if (t.lookalike) rows.push(["Look-alike panel", `${t.lookalike}${s.type === "lookalike" ? " — named, not escalated" : ""}`]);
  if (t.isStroke && t.expectedLevel === "possible") {
    const focal = t.signs.some((k) => k === "face" || k === "arms" || k === "speech");
    rows.push(["Why it is hard", focal
      ? "Only one kind of sign is described, so LastWell holds at Possible until a second sign is quoted."
      : "No face, arm or speech sign is described, so LastWell holds at Possible and the banner asks for a face or arm check."]);
  }
  if (t.expectedLevel === "likely") rows.push(["Then", "The dispatcher sends the pre-alert; the medical professional’s phone rings with the briefing."]);
  return `<section class="card back"><div class="tag">${card.pile === "stroke" ? "Stroke pile" : "Full deck"} · sealed answer · script ${s.id}</div>
<h2>Flip after LastWell decides</h2>
<table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table>
<p class="foot">Scripted case written by the team (docs/07). LastWell never says “not a stroke”; the treating team decides.</p></section>`;
}

function front(card, n) {
  return `<section class="card front"><div class="tag">${card.pile === "stroke" ? "Stroke pile" : "Full deck"} · card ${n}</div>
<h2>${esc(card.who)}</h2><ul>${card.lines.map((l) => `<li>${esc(l).replace(BLANK, '<span class="blank">&nbsp;</span>')}</li>`).join("")}</ul>
<p class="foot">Caller: act this in your own words. Answer only what the dispatcher asks. Never show the back.</p></section>`;
}

const scripts = Object.fromEntries(CARDS.map((c) => [c.id, JSON.parse(readFileSync(join(SCRIPTS, `${c.id}.json`), "utf8"))]));
const piles = { stroke: CARDS.filter((c) => c.pile === "stroke"), deck: CARDS.filter((c) => c.pile === "deck") };
if (piles.stroke.length !== 4 || piles.deck.length !== 12) throw new Error(`need 4 + 12 cards, got ${piles.stroke.length} + ${piles.deck.length}`);
for (const c of piles.stroke) if (!scripts[c.id].truth.isStroke) throw new Error(`${c.id} is in the stroke pile but is not a stroke`);
// EMT feedback (2026-10-24): lead with strokes that do not look like strokes; the pile carries at least 2 chameleons.
if (piles.stroke.filter((c) => scripts[c.id].type === "chameleon").length < 2) throw new Error("stroke pile needs at least 2 chameleons");
for (const c of CARDS) if (scripts[c.id].truth.isStroke && scripts[c.id].truth.lkw !== null && !c.lines.some((l) => l.includes(BLANK))) throw new Error(`${c.id}: stroke card without the LKW blank (D-20)`);

let n = 0;
// Stroke pile first in print, chameleons leading, so the presenter can open with a chameleon.
const order = (c) => (scripts[c.id].type === "chameleon" ? 0 : 1);
const pages = [...[...piles.stroke].sort((a, b) => order(a) - order(b)), ...piles.deck].map((c) => front(c, ++n) + back(c, scripts[c.id])).join("\n");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>LastWell Demo Cards</title>
<!-- Generated by scripts/build-cards.mjs from apps/eval/scripts (task C-04). Do not edit by hand: run \`pnpm cards\`. -->
<style>
  :root { --ink: #111; --muted: #555; --line: #bbb; --paper: #fff; --accent: #b45309; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 20pt/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { min-height: 100vh; padding: 0.8in 0.9in; display: flex; flex-direction: column; gap: 0.25in; page-break-after: always; break-after: page; border-bottom: 1px dashed var(--line); }
  .tag { font-size: 12pt; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  h2 { font-size: 24pt; margin: 0; }
  ul { margin: 0; padding-left: 1.1em; display: grid; gap: 0.18in; }
  .blank { display: inline-block; min-width: 2.4in; border-bottom: 2px solid var(--ink); }
  .back { background: #f6f6f4; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; vertical-align: top; padding: 0.08in 0.12in; border-bottom: 1px solid var(--line); }
  th { width: 32%; font-weight: 600; color: var(--muted); font-size: 16pt; }
  .foot { margin-top: auto; font-size: 12pt; color: var(--muted); }
  @media screen { body { max-width: 9in; margin: 0 auto; } .card { min-height: auto; } }
  @media print { .card { border: 0; } @page { size: letter; margin: 0; } }
</style></head>
<body>
${pages}
</body></html>
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`cards: wrote ${OUT} (${piles.deck.length} full-deck + ${piles.stroke.length} stroke-pile cards, ${CARDS.length * 2} pages)`);
