// Alert status helpers for the console (W-05) and the board (W-06). Pure; unit-tested.
import type { AlertStatus, AlertSummary } from "@lastwell/core";
import { GatewayError } from "./gateway";

/** docs/03 §6: a call may not get a second alert while one is in queued..qa. */
export const ACTIVE_STATUSES: AlertStatus[] = ["queued", "calling", "ringing", "answered", "briefed", "qa"];
export const RETRY_STATUSES: AlertStatus[] = ["calling", "ringing", "failed"];
export const HANGUP_STATUSES: AlertStatus[] = ["calling", "ringing", "answered", "briefed", "qa"];

export const STATUS_LABEL: Record<AlertStatus, string> = {
  queued: "Preparing briefing",
  calling: "Calling",
  ringing: "Ringing",
  answered: "Answered",
  briefed: "Briefed",
  qa: "Q&A",
  completed: "Completed",
  failed: "Failed",
};

export type Delivery = "phone" | "local";

/** Steps shown in the progress strip; Q&A only when the feature is on (D-32); local delivery has no call (D-43). */
export function statusSteps(featureQa: boolean, delivery: Delivery = "phone"): AlertStatus[] {
  if (delivery === "local") return ["queued", "briefed", "completed"];
  return featureQa
    ? ["calling", "ringing", "answered", "briefed", "qa", "completed"]
    : ["calling", "ringing", "answered", "briefed", "completed"];
}

export function stepIndex(status: AlertStatus, steps: AlertStatus[]): number {
  if (status === "queued" && !steps.includes("queued")) return -1;
  const i = steps.indexOf(status);
  return i === -1 && status === "qa" ? steps.indexOf("briefed") : i;
}

/** The alert the console shows: the newest one for this call. */
export function latestAlert(alerts: AlertSummary[]): AlertSummary | null {
  return alerts.reduce<AlertSummary | null>((best, a) => (!best || a.createdAt > best.createdAt ? a : best), null);
}

export function isActive(a: AlertSummary | null): boolean {
  return a !== null && ACTIVE_STATUSES.includes(a.status);
}

/** Human message for a failed send; the allowlist 409 (D-35) gets its own clear wording. */
export function sendErrorText(err: unknown): string {
  if (err instanceof GatewayError) {
    const blob = `${err.code} ${err.message}`.toLowerCase();
    if (err.status === 409 && /allow/.test(blob)) {
      return `Not sent: this number is not on the allowed list (ALERT_ALLOWED_NUMBERS). No call was placed. (${err.message})`;
    }
    if (err.status === 409) return `Not sent: ${err.message}`;
    if (err.status === 400) return `Not sent: check the number (${err.message})`;
    if (err.status === 502) return `Not sent: a vendor failed — ${err.message}`;
    if (err.status === 0) return "Not sent: the gateway is unreachable. Check the network and try again.";
    return `Not sent: ${err.message}`;
  }
  return "Not sent: unexpected error.";
}

/** Status wording: in local delivery `queued` means the audio is ready to play. */
export function statusLabel(status: AlertStatus, delivery: Delivery = "phone"): string {
  if (delivery === "local" && status === "queued") return "Ready to play";
  if (delivery === "local" && status === "briefed") return "Played";
  return STATUS_LABEL[status];
}

/** W-12: Play is offered for a local alert until it fails; after completion it replays without reporting. */
export function canPlay(a: AlertSummary, delivery: Delivery): boolean {
  return delivery === "local" && a.status !== "failed";
}
