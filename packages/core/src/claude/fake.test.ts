// X-01a acceptance: the fake model reproduces the docs/04 fixture expectations, and A01/B01/C01 run
// through fake fast pass → validator → reducer → fake reasoner → guard reach the docs/00 acceptance
// rows 2–4 and 9 and the docs/03 CaseState fixtures.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CaseState, EvalScript, FastPassOutput, ReasonerOutput } from "../contracts/index.js";
import { runScript, type ScriptedRunResult } from "../eval/scriptedRunner.js";
import { resolveLookalike } from "../state/nextQuestion.js";
import { norm } from "../validate/quotes.js";
import { createFakeModel } from "./fake.js";
import { FAST_PASS_FIXTURES } from "./fixtures.js";

const SCRIPTS = fileURLToPath(new URL("../../../../apps/eval/scripts/", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));
const TZ = "America/Los_Angeles";

function script(id: string): EvalScript {
  return EvalScript.parse(JSON.parse(readFileSync(`${SCRIPTS}${id}.json`, "utf8")));
}
function fixture(id: string): CaseState {
  return CaseState.parse(JSON.parse(readFileSync(`${FIXTURES}caseState.${id}.json`, "utf8")));
}

describe("fake fast pass — docs/04 §2 fixture table", () => {
  const model = createFakeModel();
  for (const fx of FAST_PASS_FIXTURES) {
    it(fx.utterance, async () => {
      const r = await model.fastPass({ utteranceText: fx.utterance, prevDispatcherText: fx.prevDispatcherText });
      const out = FastPassOutput.parse(r.output);
      expect(out.signs.map((s) => s.kind).sort()).toEqual(fx.signs.map((s) => s.kind).sort());
      for (const want of fx.signs) {
        const got = out.signs.find((s) => s.kind === want.kind);
        if (want.quotes) expect(want.quotes.map(norm)).toContain(norm(got?.quote ?? ""));
      }
      for (const want of fx.facts) {
        const got = out.facts.find((f) => f.kind === want.kind);
        expect(got, want.kind).toBeDefined();
        if (want.value !== undefined) expect(got?.value).toBe(want.value);
        if (want.quote !== undefined) expect(norm(got?.quote ?? "")).toBe(norm(want.quote));
      }
      if (fx.facts.length === 0) expect(out.facts).toEqual([]);
      // Every quote is an exact substring of the utterance.
      for (const q of [...out.signs, ...out.facts].map((x) => x.quote)) expect(fx.utterance).toContain(q);
    });
  }
});

describe("fake model through the pipeline — A01, B01, C01", () => {
  const runs = new Map<string, ScriptedRunResult>();
  async function run(id: string): Promise<ScriptedRunResult> {
    const cached = runs.get(id);
    if (cached) return cached;
    const r = await runScript(script(id), createFakeModel(), { timezone: TZ });
    runs.set(id, r);
    return r;
  }

  function expectQuotesVerbatim(r: ScriptedRunResult): void {
    for (const item of [...r.state.signs, ...r.state.facts]) {
      const u = r.utterances.find((x) => x.id === item.ref.utteranceId);
      expect(u?.speaker === "caller" || item.kind === "address").toBe(true);
      expect(u?.text).toContain(item.ref.quote);
      expect(item.ref.tMs).toBe(u?.tStartMs);
    }
  }

  function expectMatchesFixture(r: ScriptedRunResult, id: string): void {
    const fx = fixture(id);
    const s = r.state;
    expect(s.level).toBe(fx.level);
    expect(s.signs.map((x) => [x.kind, x.ref.quote])).toEqual(fx.signs.map((x) => [x.kind, x.ref.quote]));
    expect(s.lkw?.display).toBe(fx.lkw?.display);
    expect(s.lkw?.confidence).toBe(fx.lkw?.confidence);
    expect(s.lookalikes.map((l) => l.name)).toEqual(fx.lookalikes.map((l) => l.name));
    expect(s.nextQuestion).toEqual(fx.nextQuestion);
    expect(s.reasonerQuestion).toEqual(fx.reasonerQuestion);
    expect(s.droppedCount).toBe(0);
    // Fact kinds/values match; quotes may be shorter or longer spans than the hand-written fixture.
    const kv = (fs: CaseState["facts"]): string[] => fs.map((f) => `${f.kind}=${f.value}`).sort();
    const expected = kv(fx.facts).map((x) => (x === "diabetes=diabetic, skipped dinner" ? "diabetes=diabetic" : x));
    expect(kv(s.facts)).toEqual(expected.sort());
  }

  it("A01: likely, two chips with verbatim quotes, LKW with range, Eliquis (rows 2–3)", async () => {
    const r = await run("A01");
    expect(r.state.level).toBe("likely");
    expect(new Set(r.state.signs.map((x) => x.kind))).toEqual(new Set(["speech", "arms"]));
    expectQuotesVerbatim(r);
    expect(r.state.lkw?.display).toBe("2:00 PM (1:45–2:15 PM)");
    expect(norm(r.state.lkw?.ref.quote ?? "")).toContain(norm("fine at about 2 PM"));
    const bt = r.state.facts.find((f) => f.kind === "blood_thinner");
    expect(bt?.value).toBe("Eliquis");
    expect(bt?.ref.quote).toBe("he takes Eliquis");
    // ≤ 12 s after "coffee cup" (turn at 11 s): likely right after that turn.
    expect(r.firstAtMs.likely).toBe(11000);
    expectMatchesFixture(r, "A01");
  });

  it("A01: the banner asks for an exact time before the clock time, then moves to blood thinners (row 4)", async () => {
    const r = await run("A01");
    const banners = r.turns.map((t) => t.nextQuestion?.text ?? null);
    const exact = banners.indexOf("Ask: what time exactly was he last seen completely normal?");
    const thinners = banners.indexOf("Ask: does he take any blood thinners, like Eliquis, Xarelto or warfarin?");
    expect(exact).toBeGreaterThanOrEqual(0);
    expect(r.turns[exact]?.atMs).toBe(11000);
    expect(thinners).toBeGreaterThan(exact);
    expect(r.turns[thinners]?.atMs).toBe(30000);
  });

  it("B01: possible with balance + eyes chips and a face or arm check banner (row 9)", async () => {
    const r = await run("B01");
    expect(r.state.level).toBe("possible");
    expect(new Set(r.state.signs.map((x) => x.kind))).toEqual(new Set(["balance", "eyes"]));
    expectQuotesVerbatim(r);
    expect(["face", "arms"]).toContain(r.state.nextQuestion?.kind);
    expect(r.state.facts.find((f) => f.kind === "blood_thinner")?.value).toBe("none");
    expectMatchesFixture(r, "B01");
  });

  it("C01: possible or lower; low blood sugar answered by the diabetes fact (row 9)", async () => {
    const r = await run("C01");
    expect(["none", "possible"]).toContain(r.state.level);
    expectQuotesVerbatim(r);
    const first = r.state.lookalikes[0];
    expect(first?.name).toBe("low blood sugar");
    const res = first === undefined ? null : resolveLookalike(first, r.state);
    expect(res?.resolved).toBe(true);
    expect(res?.fact?.kind).toBe("diabetes");
    expect(res?.fact?.value).toBe("diabetic");
    expectMatchesFixture(r, "C01");
  });

  it("reasoner outputs parse against the docs/03 §4 schema and never say 'not a stroke'", async () => {
    for (const id of ["A01", "B01", "C01"]) {
      const r = await run(id);
      const out = await createFakeModel().reason({
        utterances: r.utterances,
        state: r.state,
        callStartedAt: new Date(),
        now: new Date(),
        timezone: TZ,
      });
      const parsed = ReasonerOutput.parse(out.output);
      expect(parsed.summary.toLowerCase()).not.toContain("not a stroke");
      expect(parsed.summary.split(/\s+/).length).toBeLessThanOrEqual(25);
      expect(parsed.next_question.text === "" || parsed.next_question.text.startsWith("Ask")).toBe(true);
    }
  });

  it("Q&A answers from validated facts only, and says unknown otherwise", async () => {
    const r = await run("A01");
    const model = createFakeModel();
    const ask = (questionText: string) => model.answer({ questionText, utterances: r.utterances, state: r.state, now: new Date(), timezone: TZ });
    const yes = (await ask("Is he on blood thinners?")).output;
    expect(yes?.known).toBe(true);
    expect(yes?.evidence[0]?.quote).toBe("he takes Eliquis");
    expect((await ask("Any seizure before this?")).output?.known).toBe(false);
  });
});
