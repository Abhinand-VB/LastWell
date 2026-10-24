// docs/03 §12 — Twilio message schemas. Only the fields the gateway reads are required; everything
// else passes through, because a vendor adding or omitting a cosmetic field must never stop a call.
import { z } from "zod/v4";

export const TwilioMediaMessage = z.discriminatedUnion("event", [
  z.object({ event: z.literal("connected") }).passthrough(),
  z
    .object({
      event: z.literal("start"),
      streamSid: z.string(),
      start: z
        .object({
          accountSid: z.string(),
          callSid: z.string(),
          tracks: z.array(z.string()).optional(),
          customParameters: z.record(z.string(), z.string()).optional(),
          mediaFormat: z
            .object({ encoding: z.string(), sampleRate: z.number(), channels: z.number() })
            .passthrough()
            .optional(),
        })
        .passthrough(),
    })
    .passthrough(),
  z
    .object({
      event: z.literal("media"),
      streamSid: z.string(),
      media: z
        .object({
          track: z.enum(["inbound", "outbound"]).optional(), // optional for safety; treated as "inbound" when absent
          timestamp: z.string(), // integer ms as a string; parse with Number()
          payload: z.string(), // base64 µ-law, no headers
        })
        .passthrough(),
    })
    .passthrough(),
  z
    .object({ event: z.literal("mark"), streamSid: z.string(), mark: z.object({ name: z.string() }).passthrough() })
    .passthrough(),
  z.object({ event: z.literal("dtmf"), streamSid: z.string() }).passthrough(),
  z.object({ event: z.literal("stop"), streamSid: z.string() }).passthrough(),
]);
export type TwilioMediaMessage = z.infer<typeof TwilioMediaMessage>;

/** Messages the gateway sends on a bidirectional `<Connect><Stream>` (docs/01 §4.1). */
export const TwilioOutboundMessage = z.discriminatedUnion("event", [
  z.object({ event: z.literal("media"), streamSid: z.string(), media: z.object({ payload: z.string() }) }),
  z.object({ event: z.literal("mark"), streamSid: z.string(), mark: z.object({ name: z.string() }) }),
  z.object({ event: z.literal("clear"), streamSid: z.string() }),
]);
export type TwilioOutboundMessage = z.infer<typeof TwilioOutboundMessage>;

export const TwilioCallStatus = z.enum([
  "queued", "initiated", "ringing", "in-progress", "completed", "busy", "no-answer", "failed", "canceled",
]);
export type TwilioCallStatus = z.infer<typeof TwilioCallStatus>;

/** `POST /twilio/voice` form body (docs/01 §4.1). */
export const TwilioVoiceWebhookBody = z
  .object({
    CallSid: z.string(),
    AccountSid: z.string().optional(),
    From: z.string(),
    To: z.string(),
    CallStatus: z.string(),
  })
  .passthrough();
export type TwilioVoiceWebhookBody = z.infer<typeof TwilioVoiceWebhookBody>;

/** `POST /twilio/alert-status` form body (docs/03 §6). Unknown statuses are logged and ignored. */
export const TwilioStatusCallbackBody = z
  .object({
    CallSid: z.string(),
    CallStatus: z.string(),
  })
  .passthrough();
export type TwilioStatusCallbackBody = z.infer<typeof TwilioStatusCallbackBody>;
