// C-02 content checks for the D-33 eval scripts (docs/07 §3), beyond the schema rules in `validate`:
// each script's last-known-well phrase is a caller's words and the real LKW parser, run at the moment
// it was spoken, lands within the truth tolerance. A script edit that breaks the LKW arithmetic fails here.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { keywordBaseline, parseLkw, validateScript, type EvalScript } from "@lastwell/core";

const DIR = import.meta.dirname;
const TZ = "America/Los_Angeles";

// D-33: the text-mode eval set.
const D33 = ["A01", "A02", "A03", "A04", "A05", "A06", "A07", "B01", "B02", "B04", "B06", "B08", "C01", "C02", "C03", "C04", "C05", "D01", "D02", "D04"];

// The caller's LKW phrase per script (null = the caller never gives one; truth.lkw is null).
const LKW_PHRASE: Record<string, string | null> = {
  A01: "fine at about 2 PM",
  A02: "fine around 12:30",
  A03: "About an hour ago",
  A04: null,
  A05: "Ten minutes ago",
  A06: "fine at breakfast",
  A07: "About twenty minutes ago",
  B01: "fine about half an hour ago",
  B02: "About an hour ago",
  B04: "talked at 11",
  B06: "Ten minutes ago",
  B08: "About 45 minutes ago",
  C01: "About an hour ago",
  C02: "Ten minutes ago",
  C03: "About an hour ago",
  C04: "About an hour ago",
  C05: "fine yesterday morning",
  D01: null,
  D02: null,
  D04: null,
};

function load(id: string): EvalScript {
  const check = validateScript(JSON.parse(readFileSync(join(DIR, `${id}.json`), "utf8")) as unknown);
  if (!check.ok) throw new Error(`${id}: ${check.errors.join("; ")}`);
  return check.script;
}

describe("eval scripts (C-02, D-33)", () => {
  it("contains every D-33 script", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
    for (const id of D33) expect(files).toContain(id);
  });

  it.each(D33)("%s has 8–14 turns, opens with the address question, and stroke scripts avoid the word 'stroke'", (id) => {
    const s = load(id);
    expect(s.turns.length).toBeGreaterThanOrEqual(8);
    expect(s.turns.length).toBeLessThanOrEqual(14);
    expect(s.turns[0]?.text).toMatch(/address/i);
    if (s.truth.isStroke) for (const t of s.turns) expect(t.text).not.toMatch(/\bstroke\b/i);
  });

  it.each(D33)("%s: the LKW phrase parses to the truth time", (id) => {
    const s = load(id);
    const phrase = LKW_PHRASE[id];
    if (phrase === undefined) throw new Error(`no LKW phrase entry for ${id}`);
    if (phrase === null) {
      expect(s.truth.lkw).toBeNull();
      return;
    }
    const turn = s.turns.find((t) => t.speaker === "caller" && t.text.toLowerCase().includes(phrase.toLowerCase()));
    expect(turn, `caller turn containing "${phrase}"`).toBeDefined();
    const saidAt = DateTime.fromISO(s.callStartLocal, { zone: TZ }).plus({ milliseconds: turn!.atMs });
    const out = parseLkw({ phrase, saidAt: saidAt.toISO()!, timezone: TZ });
    expect(out.confidence).not.toBe("unknown");
    expect(s.truth.lkw).not.toBeNull();
    const truth = DateTime.fromISO(s.truth.lkw!.localTime, { zone: TZ });
    const offMin = Math.abs(DateTime.fromISO(out.lkwAt!).diff(truth, "minutes").minutes);
    expect(offMin, `${out.display} vs truth ${s.truth.lkw!.localTime}`).toBeLessThanOrEqual(s.truth.lkw!.toleranceMin);
  });

  it("keyword baseline result is stable (for the slide: what a keyword alert would do)", () => {
    const flagged = D33.filter((id) => keywordBaseline(load(id).turns).flagged);
    expect(flagged).toMatchInlineSnapshot(`
      [
        "A02",
        "A05",
        "B08",
        "C03",
        "C04",
        "C05",
      ]
    `);
  });
});
