// pnpm e2e — offline black-box test of the demo path (docs/10 §5, task X-02).
// Spawns the gateway with LASTWELL_FAKES=all on a free port, drives the dev routes (docs/10 §4.1) over
// HTTP, reads results over /ws/ui (docs/03 §5) and REST (docs/03 §6), and checks A01, B01 and C01.
// A route that does not exist yet is PENDING (its task has not landed) and does not fail the run,
// unless E2E_STRICT=1 (release checks, X-05). Anything the gateway does answer is checked strictly.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DateTime } from "luxon";
import { resolveLookalike, type CaseState, type EvalScript, type Utterance } from "@lastwell/core";
import { Pending, Rest, UiSocket, type ServerMsg } from "./client.js";
import { ALLOWED_PHONE, NOT_ALLOWED_PHONE, startGateway, tail, TIMEZONE, type Gateway } from "./gateway.js";

const STRICT = process.env.E2E_STRICT === "1";
const SCRIPTS_DIR = join(import.meta.dirname, "..", "..", "eval", "scripts");

type Outcome = "PASS" | "FAIL" | "PENDING";
const results: Array<{ outcome: Outcome; name: string; detail?: string }> = [];

function record(outcome: Outcome, name: string, detail?: string): void {
  results.push({ outcome, name, detail });
  console.log(`${outcome.padEnd(7)} ${name}${detail ? ` — ${detail}` : ""}`);
}

function check(name: string, ok: boolean, detail?: string): boolean {
  record(ok ? "PASS" : "FAIL", name, ok ? undefined : detail);
  return ok;
}

function loadScript(id: string): EvalScript {
  return JSON.parse(readFileSync(join(SCRIPTS_DIR, `${id}.json`), "utf8")) as EvalScript;
}

// docs/03 §7 normalization (with D-26: apostrophes dropped): the quote must be in its utterance.
function norm(s: string): string {
  return s.toLowerCase().normalize("NFKC").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

interface CallRun {
  callId: string;
  states: CaseState[]; // state.updated in arrival order, filtered to this call
  utterances: Utterance[];
  lkwTurnIndex: number; // index into states at the moment the LKW turn was injected (-1 if none)
  final: CaseState;
}

async function runCall(rest: Rest, sock: UiSocket, id: string, transform?: (text: string) => string, lkwPhrase?: string): Promise<CallRun> {
  const script = loadScript(id);
  const created = await rest.need("POST", "/api/dev/calls", {}, "X-01b");
  if (created.status !== 200 && created.status !== 201) throw new Error(`POST /api/dev/calls → ${created.status} ${JSON.stringify(created.body)}`);
  const callId = (created.body as { callId: string }).callId;

  sock.send({ type: "subscribe", scope: "call", callId });
  await sock.waitFor((m) => m.type === "snapshot" && m.callId === callId, 5000, `snapshot for ${id}`);

  const statesFor = () =>
    sock.messages.flatMap((m: ServerMsg) => (m.type === "state.updated" && m.callId === callId ? [m.state] : []));
  let lkwTurnIndex = -1;

  for (const turn of script.turns) {
    const text = transform ? transform(turn.text) : turn.text;
    if (lkwPhrase && turn.speaker === "caller" && text.includes(lkwPhrase)) lkwTurnIndex = statesFor().length;
    const r = await rest.need("POST", `/api/dev/calls/${callId}/utterances`, { speaker: turn.speaker, text }, "X-01b");
    if (r.status >= 300) throw new Error(`inject utterance → ${r.status} ${JSON.stringify(r.body)}`);
    await sock.settle(turn.speaker === "caller" ? 700 : 250);
  }

  const ended = await rest.need("POST", `/api/dev/calls/${callId}/end`, {}, "X-01b");
  if (ended.status >= 300) throw new Error(`end call → ${ended.status}`);
  await sock.waitFor((m) => m.type === "call.ended" && m.callId === callId, 10_000, `call.ended for ${id}`);
  await sock.settle(800, 10_000); // final reasoner run after call end (docs/05 §6)

  const states = statesFor();
  if (states.length === 0) throw new Pending(`${id}: no state.updated for the call (call runner V-05 not wired to the dev routes)`);
  const utterances = sock.messages.flatMap((m) => (m.type === "utterance.final" && m.callId === callId ? [m.utterance] : []));
  const final = states.reduce((a, b) => (b.version >= a.version ? b : a));
  return { callId, states, utterances, lkwTurnIndex, final };
}

function checkQuotes(label: string, run: CallRun): void {
  const byId = new Map(run.utterances.map((u) => [u.id, u]));
  const refs = [
    ...run.final.signs.map((s) => ({ what: `sign ${s.kind}`, ref: s.ref })),
    ...run.final.facts.map((f) => ({ what: `fact ${f.kind}`, ref: f.ref })),
    ...(run.final.lkw ? [{ what: "lkw", ref: run.final.lkw.ref }] : []),
  ];
  const bad = refs.filter(({ ref }) => {
    const u = byId.get(ref.utteranceId);
    return u === undefined || !norm(u.text).includes(norm(ref.quote)) || ref.tMs !== u.tStartMs;
  });
  check(`${label}: every sign/fact/LKW quote is in its utterance with that utterance's tMs (quote or drop)`, bad.length === 0,
    bad.map((b) => `${b.what} "${b.ref.quote}"`).join(", "));
}

function kinds(state: CaseState): Set<string> {
  return new Set(state.signs.map((s) => s.kind));
}

/** Card time like the demo (D-20): the half-hour mark about one hour before now, written bare ("9:30"). */
function cardTime(): { spoken: string; at: DateTime } {
  const t = DateTime.now().setZone(TIMEZONE).minus({ minutes: 60 });
  const at = t.set({ minute: t.minute < 30 ? 0 : 30, second: 0, millisecond: 0 });
  return { spoken: at.toFormat("h:mm"), at };
}

async function scenarioA01(gw: Gateway, rest: Rest, sock: UiSocket): Promise<void> {
  const card = cardTime();
  const phrase = `fine at about ${card.spoken}`;
  const run = await runCall(rest, sock, "A01", (text) => text.replace("fine at about 2 PM", phrase), phrase);
  const f = run.final;

  check("A01: level likely", f.level === "likely", `level ${f.level}`);
  check("A01: ≥ 2 distinct BE-FAST sign kinds", kinds(f).size >= 2, [...kinds(f)].join(", "));
  checkQuotes("A01", run);

  const lkw = f.lkw;
  const near = (iso: string | null, want: DateTime) => iso !== null && Math.abs(DateTime.fromISO(iso).diff(want, "minutes").minutes) <= 1;
  check(`A01: LKW parsed to the card time ${card.spoken} with a ±15 min range`,
    lkw !== null && lkw.confidence === "approx" && lkw.note === null && near(lkw.lkwAt, card.at) &&
      near(lkw.rangeStart, card.at.minus({ minutes: 15 })) && near(lkw.rangeEnd, card.at.plus({ minutes: 15 })),
    lkw ? `${lkw.display} [${lkw.confidence}${lkw.note ? `, ${lkw.note}` : ""}]` : "lkw null");
  const thinner = f.facts.find((x) => x.kind === "blood_thinner");
  check("A01: blood thinner Eliquis", thinner !== undefined && /eliquis/i.test(thinner.value), thinner?.value ?? "absent");

  // docs/00 row 4: the "what time exactly" banner before the clock time, then blood thinners.
  const before = run.states.slice(0, run.lkwTurnIndex < 0 ? run.states.length : run.lkwTurnIndex);
  const askedExact = before.some((s) => s.nextQuestion?.kind === "lkw" && /what time exactly/i.test(s.nextQuestion.text));
  const after = run.states.slice(Math.max(0, run.lkwTurnIndex));
  const movedOn = after.some((s) => s.nextQuestion?.kind === "blood_thinner");
  check("A01: banner asked \"what time exactly\" before the clock time, then moved on to blood thinners", askedExact && movedOn,
    `banners: ${[...new Set(run.states.map((s) => s.nextQuestion?.text ?? "∅"))].join(" → ")}`);

  // Approve → allowlist (D-35) → fake telephony drives the alert to briefed.
  sock.send({ type: "subscribe", scope: "board" });
  const refused = await rest.need("POST", `/api/calls/${run.callId}/alert`, { targetPhone: NOT_ALLOWED_PHONE, confirm: true }, "V-06");
  check("A01: approve to a number outside ALERT_ALLOWED_NUMBERS → 409 (D-35)", refused.status === 409, `status ${refused.status}`);
  const approved = await rest.need("POST", `/api/calls/${run.callId}/alert`, { targetPhone: ALLOWED_PHONE, confirm: true }, "V-06");
  if (!check("A01: approve to an allowlisted number → 200 with an alert", approved.status === 200 || approved.status === 201, `status ${approved.status} ${JSON.stringify(approved.body).slice(0, 200)}`)) return;
  const alert = (approved.body as { alert: { id: string; briefingText: string } }).alert;
  check("A01: briefing text names Eliquis and the last-known-well time", /Eliquis/.test(alert.briefingText) && /Last known well/.test(alert.briefingText), alert.briefingText);

  try {
    await sock.waitFor((m) => m.type === "alert.updated" && m.alert.id === alert.id && m.alert.status === "briefed", 30_000, "alert status briefed");
    record("PASS", "A01: alert status reached briefed (fake telephony)");
  } catch (err) {
    const seen = sock.messages.flatMap((m) => (m.type === "alert.updated" && m.alert.id === alert.id ? [m.alert.status] : []));
    if (seen.length === 0) record(STRICT ? "FAIL" : "PENDING", "A01: alert status reached briefed", "no alert.updated at all (V-07 / fake telephony not landed)");
    else record("FAIL", "A01: alert status reached briefed", `${(err as Error).message}; statuses seen: ${seen.join(" → ")}`);
  }

  const board = await rest.need("GET", "/api/alerts?sinceHours=24", undefined, "V-06");
  const listed = (board.body as { alerts?: Array<{ id: string }> }).alerts?.some((a) => a.id === alert.id) ?? false;
  check("A01: board REST (GET /api/alerts) lists the alert", board.status === 200 && listed, `status ${board.status}`);
  void gw;
}

async function scenarioB01(rest: Rest, sock: UiSocket): Promise<void> {
  const run = await runCall(rest, sock, "B01");
  const f = run.final;
  const k = kinds(f);
  check("B01: level possible", f.level === "possible", `level ${f.level}`);
  check("B01: never likely during the call (D-21)", run.states.every((s) => s.level !== "likely"));
  check("B01: balance + eyes chips", k.has("balance") && k.has("eyes"), [...k].join(", "));
  checkQuotes("B01", run);
  check("B01: banner asked for a face or arm check", run.states.some((s) => s.nextQuestion?.kind === "face" || s.nextQuestion?.kind === "arms"),
    `banners: ${[...new Set(run.states.map((s) => s.nextQuestion?.kind ?? "∅"))].join(" → ")}`);
}

async function scenarioC01(rest: Rest, sock: UiSocket): Promise<void> {
  const run = await runCall(rest, sock, "C01");
  const f = run.final;
  check("C01: level stays at possible or lower", run.states.every((s) => s.level !== "likely"), `final ${f.level}`);
  checkQuotes("C01", run);
  const low = f.lookalikes.find((l) => /low blood sugar/i.test(l.name));
  check("C01: look-alike panel shows low blood sugar", low !== undefined, f.lookalikes.map((l) => l.name).join(", ") || "none");
  if (low) {
    const r = resolveLookalike(low, f);
    check("C01: look-alike resolved by the diabetes fact (\"answered\")", r.resolved && r.fact?.kind === "diabetes", JSON.stringify(r));
  }
}

async function scenario(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof Pending) record(STRICT ? "FAIL" : "PENDING", name, err.message);
    else record("FAIL", name, (err as Error).message);
  }
}

async function main(): Promise<number> {
  const started = Date.now();
  let gw: Gateway;
  try {
    gw = await startGateway();
  } catch (err) {
    record("FAIL", "gateway boots with LASTWELL_FAKES=all and no secrets", (err as Error).message);
    return 1;
  }
  console.log(`e2e: gateway up at ${gw.baseUrl} (log ${gw.logFile})`);
  const rest = new Rest(gw.baseUrl);
  let sock: UiSocket | null = null;
  try {
    const health = await rest.req("GET", "/healthz");
    const fakes = (health.body as { fakes?: unknown }).fakes;
    if (Array.isArray(fakes)) check("healthz reports the active fakes", fakes.length >= 5 || fakes.includes("all"), JSON.stringify(fakes));
    else record(STRICT ? "FAIL" : "PENDING", "healthz reports the active fakes", "no `fakes` field (X-01b not landed)");

    await scenario("ui websocket: token + auth", async () => {
      const tok = await rest.need("GET", "/api/ws-token", undefined, "V-04");
      if (tok.status !== 200) throw new Error(`GET /api/ws-token → ${tok.status}`);
      sock = await UiSocket.open(gw.wsUrl, (tok.body as { token: string }).token);
      record("PASS", "ui websocket: token + auth");
    });
    if (sock !== null) {
      const s: UiSocket = sock;
      await scenario("A01 (Card A)", () => scenarioA01(gw, rest, s));
      await scenario("B01 (Card B)", () => scenarioB01(rest, s));
      await scenario("C01 (Card C)", () => scenarioC01(rest, s));
      check("every /ws/ui message matched the docs/03 §5 contract", s.violations.length === 0, s.violations.slice(0, 5).join(" | "));
    }
  } finally {
    (sock as UiSocket | null)?.close();
    await gw.stop();
  }

  const n = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  console.log(`\ne2e: ${n("PASS")} passed, ${n("FAIL")} failed, ${n("PENDING")} pending${STRICT ? " (strict)" : ""} in ${Math.round((Date.now() - started) / 1000)} s`);
  if (n("PENDING") > 0) console.log("e2e: PENDING = the route or behavior's task has not landed on this branch; E2E_STRICT=1 makes it a failure.");
  if (n("FAIL") > 0) console.log(`\ngateway log tail (${gw.logFile}):\n${tail(gw.logFile)}`);
  return n("FAIL") > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
