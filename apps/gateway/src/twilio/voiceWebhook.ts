// POST /twilio/voice (docs/05 §2) and POST /twilio/alert-status (docs/03 §6): signature-validated
// against the PUBLIC url Twilio called (G-03), form bodies parsed with zod.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import twilio from "twilio";
import { TwilioStatusCallbackBody, TwilioVoiceWebhookBody } from "@lastwell/core";
import type { AlertService } from "../alerts/approve.js";
import type { CallService } from "../pipeline/calls.js";
import { maskNumber } from "../pipeline/callRegistry.js";
import { inboundTwiml } from "./twiml.js";

export interface TwilioRouteDeps {
  calls: CallService;
  alerts: AlertService;
  publicBaseUrl: string;
  authToken: string | undefined;
  validateSignature: boolean;
  twilioPhoneNumber: string | undefined;
  dispatcherPhone: string | undefined;
}

export function signatureValid(authToken: string | undefined, signature: string | undefined, url: string, params: Record<string, string>): boolean {
  if (!authToken || !signature) return false;
  try {
    return twilio.validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
}

function formParams(body: unknown): Record<string, string> {
  if (body === null || typeof body !== "object") return {};
  return Object.fromEntries(Object.entries(body as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
}

export function registerTwilioRoutes(app: FastifyInstance, deps: TwilioRouteDeps): void {
  const guard = (path: string) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!deps.validateSignature) return;
    const sig = req.headers["x-twilio-signature"];
    const ok = signatureValid(deps.authToken, typeof sig === "string" ? sig : undefined, `${deps.publicBaseUrl}${path}`, formParams(req.body));
    if (!ok) {
      req.log.warn({ event: "twilio.bad_signature", path }, "bad Twilio signature");
      return reply.code(403).send({ error: { code: "forbidden", message: "invalid Twilio signature" } });
    }
  };

  app.post("/twilio/voice", { preHandler: guard("/twilio/voice") }, async (req, reply) => {
    const parsed = TwilioVoiceWebhookBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "bad_request", message: "not a Twilio voice webhook" } });
    if (!deps.twilioPhoneNumber || !deps.dispatcherPhone) {
      return reply.code(500).send({ error: { code: "config", message: "TWILIO_PHONE_NUMBER / DISPATCHER_PHONE not set" } });
    }
    const b = parsed.data;
    const call = deps.calls.create({ mode: "phone", callerNumber: b.From || null, twilioCallSid: b.CallSid });
    req.log.info({ event: "call.webhook", callId: call.id, from: maskNumber(b.From), callSid: b.CallSid }, "inbound call");
    const xml = inboundTwiml({
      publicBaseUrl: deps.publicBaseUrl,
      callId: call.id,
      twilioPhoneNumber: deps.twilioPhoneNumber,
      dispatcherPhone: deps.dispatcherPhone,
    });
    return reply.type("text/xml").send(xml);
  });

  app.post("/twilio/alert-status", { preHandler: guard("/twilio/alert-status") }, async (req, reply) => {
    const parsed = TwilioStatusCallbackBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "bad_request", message: "not a Twilio status callback" } });
    req.log.info({ event: "twilio.status", sid: parsed.data.CallSid, callStatus: parsed.data.CallStatus }, "status callback");
    deps.alerts.onTwilioStatus(parsed.data.CallSid, parsed.data.CallStatus);
    return reply.code(204).send();
  });
}
