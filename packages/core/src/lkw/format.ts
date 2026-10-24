// Display strings for an LKW result (docs/06 §6). The UI shows these; spoken forms (briefing,
// Q&A) are composed elsewhere (docs/05 §7 rule 4), never from `display`.
import { DateTime } from "luxon";
import type { Confidence, LkwNote } from "../contracts/index.js";

export const UNKNOWN_DISPLAY = "unknown — ask when last seen normal";

const NOTE_SUFFIX: Partial<Record<LkwNote, string>> = {
  ampm_assumed: " · confirm AM/PM",
  yesterday_assumed: " · confirm day",
  clipped_to_now: " · clipped to now",
};

function clock(t: DateTime): string {
  return t.setLocale("en-US").toFormat("h:mm a");
}

/** "1:45–2:15 PM" when both ends share AM/PM, else "11:45 AM–12:15 PM". */
export function formatRange(start: DateTime, end: DateTime): string {
  const a = clock(start);
  const b = clock(end);
  const sameMeridiem = a.slice(-2) === b.slice(-2);
  return `${sameMeridiem ? a.slice(0, -3) : a}–${b}`;
}

/** "" today, "yesterday " one calendar day back, "Thursday " further back (in the call's zone). */
export function dayPrefix(point: DateTime, saidAt: DateTime): string {
  const days = Math.round(saidAt.startOf("day").diff(point.startOf("day"), "days").days);
  if (days <= 0) return "";
  if (days === 1) return "yesterday ";
  return `${point.setLocale("en-US").toFormat("cccc")} `;
}

export interface Displayable {
  point: DateTime | null;
  rangeStart: DateTime | null;
  rangeEnd: DateTime | null;
  confidence: Confidence;
  note: LkwNote | null;
}

export function formatLkw(r: Displayable, saidAt: DateTime): string {
  if (r.confidence === "unknown" || r.point === null) return UNKNOWN_DISPLAY;
  const day = dayPrefix(r.point, saidAt);
  const lead = day !== "" ? day : r.confidence === "vague" ? "about " : "";
  const question = r.note === "ampm_assumed" || r.note === "yesterday_assumed" ? "?" : "";
  const range =
    r.confidence !== "exact" && r.rangeStart !== null && r.rangeEnd !== null ? ` (${formatRange(r.rangeStart, r.rangeEnd)})` : "";
  const suffix = r.note === null ? "" : (NOTE_SUFFIX[r.note] ?? "");
  return `${lead}${clock(r.point)}${question}${range}${suffix}`;
}
