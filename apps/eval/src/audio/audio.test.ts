import { describe, expect, it } from "vitest";
import type { EvalScript } from "@lastwell/core";
import { buildTracks, GAP_MS, placeTurns } from "./timeline.js";
import { pickAccentVoice, requestBody } from "./sonic.js";
import { cell, heardScript, parseAudioArgs, voices } from "./robustness.js";
import type { ScriptRecord } from "../score.js";

const turns = [
  { speaker: "dispatcher" as const, atMs: 0, text: "911, what is your emergency?" },
  { speaker: "caller" as const, atMs: 2000, text: "My husband can't talk right." },
  { speaker: "dispatcher" as const, atMs: 3000, text: "When was he last normal?" },
];

describe("timeline", () => {
  it("keeps scripted start times and pushes a line back when the audio before it ran long", () => {
    const placed = placeTurns(turns, [1500, 2500, 1000]);
    expect(placed.map((p) => [p.startMs, p.endMs])).toEqual([
      [0, 1500],
      [2000, 4500],
      [4500 + GAP_MS, 4500 + GAP_MS + 1000],
    ]);
  });
  it("puts each line on its speaker's track, silence (0xFF) elsewhere", () => {
    const placed = placeTurns(turns, [10, 10, 10]);
    const audio = [Buffer.alloc(80, 1), Buffer.alloc(80, 2), Buffer.alloc(80, 3)];
    const t = buildTracks(placed, audio, 100);
    expect(t.lengthMs).toBe(placed[2]!.endMs + 100);
    expect(t.dispatcher[0]).toBe(1);
    expect(t.caller[0]).toBe(0xff);
    expect(t.caller[2000 * 8]).toBe(2);
    expect(t.dispatcher[2000 * 8]).toBe(0xff);
  });
});

describe("sonic request", () => {
  it("phone audio, voice by id, generation_config only when set", () => {
    const v = voices("std", "acc");
    expect(requestBody({ model: "sonic-3.6" }, "hi", v.panicked)).toMatchObject({
      model_id: "sonic-3.6",
      voice: { mode: "id", id: "std" },
      language: "en",
      output_format: { container: "raw", encoding: "pcm_mulaw", sample_rate: 8000 },
      generation_config: { speed: 1.3, emotion: "panicked" },
    });
    expect(requestBody({ model: "sonic-3.6" }, "hi", v.accent)).not.toHaveProperty("generation_config");
  });
  it("picks a non-native accented English voice, never a native one", () => {
    expect(
      pickAccentVoice([
        { id: "1", name: "Brit", description: "British accent, calm", locales: [] },
        { id: "2", name: "Sofia", description: "Woman speaking English with a Mexican Spanish accent", locales: [] },
      ])?.id,
    ).toBe("2");
    expect(pickAccentVoice([{ id: "1", name: "Brit", description: "British accent", locales: [] }])).toBeNull();
  });
});

describe("robustness run", () => {
  it("args: defaults are the six slide scripts × three variants, ≤ 30 min of audio", () => {
    expect(parseAudioArgs([])).toMatchObject({ ids: ["A01", "A03", "B01", "B02", "C01", "C03"], variants: ["calm", "accent", "panicked"], maxAudioMin: 30 });
    expect(() => parseAudioArgs(["--max-audio-min", "45"])).toThrow();
    expect(() => parseAudioArgs(["--variants", "whisper"])).toThrow();
  });
  it("what Ink heard becomes the script's turns (same truth), at the time each final arrived", () => {
    const script = { id: "A01", turns, truth: { isStroke: true } } as unknown as EvalScript;
    const hs = heardScript(script, [
      { speaker: "caller", text: "my husband cant talk right", tStartMs: 2000, arrivedMs: 4900.4 },
      { speaker: "dispatcher", text: "911 what is your emergency", tStartMs: 0, arrivedMs: 1800 },
    ]);
    expect(hs.turns).toEqual([
      { speaker: "dispatcher", atMs: 1800, text: "911 what is your emergency" },
      { speaker: "caller", atMs: 4900, text: "my husband cant talk right" },
    ]);
    expect(hs.truth).toBe(script.truth);
  });
  it("cell format", () => {
    const r = { maxLevel: "likely", firstPossibleS: 8.4, lkw: { correct: true }, bloodThinner: null, invented: [] } as unknown as ScriptRecord;
    expect(cell(r)).toBe("likely @8s · LKW ✓ · BT —");
  });
});
