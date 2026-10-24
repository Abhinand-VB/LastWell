// docs/03 §13 — Cartesia message schemas, shared by packages/stt and the gateway.
// Unknown `type` values are logged at debug and ignored by the consumers.
import { z } from "zod/v4";

export const InkEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("connected") }).passthrough(),
  z.object({ type: z.literal("turn.start") }).passthrough(),
  z.object({ type: z.literal("turn.update"), transcript: z.string() }).passthrough(),
  z.object({ type: z.literal("turn.eager_end"), transcript: z.string() }).passthrough(),
  z.object({ type: z.literal("turn.resume") }).passthrough(),
  z.object({ type: z.literal("turn.end"), transcript: z.string() }).passthrough(),
  z
    .object({
      type: z.literal("error"),
      message: z.string(),
      status_code: z.number().optional(),
      title: z.string().optional(),
      error_code: z.string().optional(),
    })
    .passthrough(),
]);
export type InkEvent = z.infer<typeof InkEvent>;

export const SonicWsEvent = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("chunk"),
      data: z.string(),
      context_id: z.string().optional(),
      done: z.boolean().optional(),
    })
    .passthrough(),
  z.object({ type: z.literal("done"), context_id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("flush_done"), context_id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("timestamps"), context_id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("phoneme_timestamps"), context_id: z.string().optional() }).passthrough(),
  z
    .object({
      type: z.literal("error"),
      message: z.string().optional(),
      context_id: z.string().optional(),
      status_code: z.number().optional(),
    })
    .passthrough(),
]);
export type SonicWsEvent = z.infer<typeof SonicWsEvent>;
