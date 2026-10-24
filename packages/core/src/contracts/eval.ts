// docs/03 §14 — eval script format (`apps/eval/scripts/*.json`, full detail in docs/07 §3).
// Cross-field rules live in ../eval/validateScript.ts.
import { z } from "zod/v4";
import { FactKind, Level, SignKind, Speaker } from "./primitives.js";

export const EvalScriptType = z.enum(["classic", "chameleon", "lookalike", "other", "hard_audio"]);
export type EvalScriptType = z.infer<typeof EvalScriptType>;

export const EvalGroup = z.enum(["native", "non_native", "panicked", "tv_background"]);
export type EvalGroup = z.infer<typeof EvalGroup>;

export const EvalTurn = z.object({ speaker: Speaker, atMs: z.number().int(), text: z.string() });
export type EvalTurn = z.infer<typeof EvalTurn>;

export const EvalTruth = z.object({
  isStroke: z.boolean(),
  expectedLevel: Level, // what a careful reader would set by the end; scored as "level agreement"
  signs: z.array(SignKind), // likely ⇒ ≥ 2 kinds incl. one of face/arms/speech (guard §8 + D-21); possible ⇒ ≥ 1
  lkw: z.object({ localTime: z.string(), toleranceMin: z.number().int().positive() }).nullable(), // null = no LKW stated
  bloodThinner: z.string().nullable(), // "none" when the caller explicitly denies; null when never mentioned
  lookalike: z.string().nullable(),
  facts: z.array(z.object({ kind: FactKind, value: z.string() })),
});
export type EvalTruth = z.infer<typeof EvalTruth>;

export const EvalScript = z.object({
  id: z.string().regex(/^[A-E]\d{2}$/),
  type: EvalScriptType,
  title: z.string(),
  sourceId: z.string().regex(/^[A-D]\d{2}$/).nullable(), // hard_audio re-reads: the script whose turns and truth apply
  callStartLocal: z.string(), // "2026-10-25T14:47:00" local wall clock for the scenario
  turns: z.array(EvalTurn), // empty for hard_audio (copied from sourceId at load)
  truth: EvalTruth,
  audio: z.object({ file: z.string(), sampleRate: z.literal(16000), speakerTag: z.enum(["single_mic"]) }).nullable(),
  group: EvalGroup.default("native"),
});
export type EvalScript = z.infer<typeof EvalScript>;
