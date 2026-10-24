// TwiML documents (docs/05 §2 canonical inbound, docs/05 §7 briefing). Built with Twilio's VoiceResponse
// so escaping is handled. Stream URLs carry no query string (G-05); ids travel as <Parameter>.
import twilio from "twilio";

export function wssBase(publicBaseUrl: string): string {
  return publicBaseUrl.replace(/^http/, "ws").replace(/\/+$/, "");
}

export interface InboundTwimlOptions {
  publicBaseUrl: string;
  callId: string;
  twilioPhoneNumber: string;
  dispatcherPhone: string;
}

export function inboundTwiml(o: InboundTwimlOptions): string {
  const r = new twilio.twiml.VoiceResponse();
  const stream = r.start().stream({ url: `${wssBase(o.publicBaseUrl)}/twilio/media`, track: "both_tracks" });
  stream.parameter({ name: "callId", value: o.callId });
  // G-04: <Start><Stream> must be followed by another verb; <Dial> keeps the call up (G-10: callerId = our number).
  r.dial({ callerId: o.twilioPhoneNumber, timeout: 25, answerOnBridge: true }).number(o.dispatcherPhone);
  r.say("The dispatcher could not be reached. Goodbye.");
  return r.toString();
}

export function alertTwiml(publicBaseUrl: string, alertId: string): string {
  const r = new twilio.twiml.VoiceResponse();
  // G-04: nothing after <Connect>.
  r.connect().stream({ url: `${wssBase(publicBaseUrl)}/twilio/alert-media` }).parameter({ name: "alertId", value: alertId });
  return r.toString();
}
