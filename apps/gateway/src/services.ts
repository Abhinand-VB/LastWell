// Real or fake implementation per external service, chosen from LASTWELL_FAKES (D-34, docs/10 §4).
import { createClaudeClient, createFakeModel, type ModelClient } from "@lastwell/core";
import type { Env } from "./env.js";
import type { Logger } from "./log.js";
import { ConvexStore } from "./store/convex.js";
import { MemoryStore } from "./store/memory.js";
import type { Store } from "./store/types.js";
import { fakeSttFactory, inkFactory, type SttSessionFactory } from "./stt/sessions.js";
import { FakeTts, SonicTts, type TtsClient } from "./tts/sonic.js";
import { TwilioTelephony, type TelephonyClient } from "./twilio/client.js";
import { FAKE_ACCOUNT_SID, FakeTelephony } from "./twilio/fake.js";

export interface Services {
  model: ModelClient;
  stt: SttSessionFactory;
  tts: TtsClient;
  telephony: TelephonyClient;
  store: Store;
  /** accountSid that Twilio media streams must carry. */
  expectedAccountSid: string;
}

export function createServices(env: Env, log: Logger): Services {
  const fake = (f: Parameters<Env["fakes"]["has"]>[0]) => env.fakes.has(f);
  const cartesia = { apiKey: env.CARTESIA_API_KEY ?? "", cartesiaVersion: env.CARTESIA_VERSION };
  const model = fake("claude")
    ? createFakeModel()
    : createClaudeClient({
        fastModel: env.CLAUDE_FAST_MODEL,
        reasonerModel: env.CLAUDE_REASONER_MODEL,
        qaModel: env.CLAUDE_QA_MODEL,
        fastEffort: env.CLAUDE_FAST_EFFORT,
        reasonerEffort: env.CLAUDE_REASONER_EFFORT,
        onResponse: (info) =>
          log.info({ event: `claude.${info.pass}`, ms: Math.round(info.ms), model: info.model, stopReason: info.stopReason, inputTokens: info.inputTokens, outputTokens: info.outputTokens, cacheReadTokens: info.cacheReadTokens }, "claude response"),
      });
  const twilioReal = !fake("twilio");
  return {
    model,
    stt: fake("stt") ? fakeSttFactory : inkFactory({ ...cartesia, model: env.CARTESIA_STT_MODEL, keyterms: env.STT_KEYTERMS }),
    tts: fake("tts") ? new FakeTts() : new SonicTts({ ...cartesia, model: env.CARTESIA_TTS_MODEL, voiceId: env.CARTESIA_VOICE_ID }),
    telephony: twilioReal
      ? new TwilioTelephony({
          accountSid: env.TWILIO_ACCOUNT_SID ?? "",
          authToken: env.TWILIO_AUTH_TOKEN ?? "",
          from: env.TWILIO_PHONE_NUMBER ?? "",
          publicBaseUrl: env.PUBLIC_BASE_URL,
          allowed: env.ALERT_ALLOWED_NUMBERS,
        })
      : new FakeTelephony(env.ALERT_ALLOWED_NUMBERS),
    store: fake("store") ? new MemoryStore() : new ConvexStore(env.CONVEX_URL ?? "", env.INTERNAL_API_KEY),
    expectedAccountSid: twilioReal ? (env.TWILIO_ACCOUNT_SID ?? "") : FAKE_ACCOUNT_SID,
  };
}
