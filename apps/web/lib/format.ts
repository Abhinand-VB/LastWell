// Display helpers shared by the console and the board. Pure; unit-tested.
import type { CaseState, QuoteRef, Sign, SignKind } from "@lastwell/core";

/** Call-relative ms → "mm:ss" (docs/02 §5). */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "820 ms" below a second, "3.1 s" above; "—" when unknown. */
export function latency(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export const SIGN_LETTER: Record<SignKind, string> = { balance: "B", eyes: "E", face: "F", arms: "A", speech: "S" };
export const SIGN_LABEL: Record<SignKind, string> = {
  balance: "Balance",
  eyes: "Eyes",
  face: "Face",
  arms: "Arms",
  speech: "Speech",
};
export const SIGN_ORDER: SignKind[] = ["balance", "eyes", "face", "arms", "speech"];

/** Every validated quote that points into the transcript (signs, facts, LKW, look-alikes). */
export function stateRefs(state: CaseState | null): QuoteRef[] {
  if (!state) return [];
  const refs: QuoteRef[] = [...state.signs.map((s) => s.ref), ...state.facts.map((f) => f.ref)];
  if (state.lkw) refs.push(state.lkw.ref);
  for (const l of state.lookalikes) if (l.ref) refs.push(l.ref);
  return refs;
}

export interface Segment {
  text: string;
  quoted: boolean;
}

/**
 * Splits an utterance into plain and quoted segments. Validated quotes are verbatim substrings
 * (docs/03 §7 returns the original span); a case-insensitive search is the fallback. Overlapping
 * spans are merged.
 */
export function quoteSegments(text: string, quotes: string[]): Segment[] {
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const q of quotes) {
    if (q.length === 0) continue;
    let at = text.indexOf(q);
    if (at === -1) at = lower.indexOf(q.toLowerCase());
    if (at !== -1) ranges.push([at, at + q.length]);
  }
  if (ranges.length === 0) return [{ text, quoted: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const out: Segment[] = [];
  let pos = 0;
  for (const [a, b] of merged) {
    if (a > pos) out.push({ text: text.slice(pos, a), quoted: false });
    out.push({ text: text.slice(a, b), quoted: true });
    pos = b;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), quoted: false });
  return out;
}

/** Whole minutes since `iso`, or null when unknown, in the future by more than a minute, or older than 24 h (docs/06 §9). */
export function minutesAgo(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const mins = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (Number.isNaN(mins) || mins < -1 || mins > 24 * 60) return null;
  return Math.max(0, mins);
}

/** "2 h 15 min ago" / "45 min ago". */
export function agoText(mins: number): string {
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h ago` : `${h} h ${m} min ago`;
}

export const WINDOW_MIN = 270; // 4.5 h treatment window from LKW (docs/06 §9)

export type Countdown =
  | { kind: "unknown" }
  | { kind: "passed" }
  | { kind: "left"; minutes: number; text: string };

/** Board countdown: remaining = lkwAt + 270 min − now. */
export function windowCountdown(lkwAt: string | null, now: Date): Countdown {
  if (!lkwAt) return { kind: "unknown" };
  const remaining = Math.floor((Date.parse(lkwAt) + WINDOW_MIN * 60_000 - now.getTime()) / 60_000);
  if (Number.isNaN(remaining)) return { kind: "unknown" };
  if (remaining <= 0) return { kind: "passed" };
  const h = Math.floor(remaining / 60);
  const m = remaining % 60;
  return { kind: "left", minutes: remaining, text: h > 0 ? `${h} h ${String(m).padStart(2, "0")} m` : `${m} m` };
}

export type Urgency = "ok" | "soon" | "urgent";

/** Board progress bar: share of the 4.5 h window still left (0..1) and its colour band. */
export function windowBar(c: Countdown): { remaining: number; urgency: Urgency } {
  if (c.kind !== "left") return { remaining: 0, urgency: "urgent" };
  const remaining = Math.min(1, c.minutes / WINDOW_MIN);
  return { remaining, urgency: c.minutes > 120 ? "ok" : c.minutes > 60 ? "soon" : "urgent" };
}

/** Clock time the 4.5 h window closes, in the call's timezone ("6:30 PM"). */
export function windowEndText(lkwAt: string, timeZone: string): string {
  const end = new Date(Date.parse(lkwAt) + WINDOW_MIN * 60_000);
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  try {
    return end.toLocaleTimeString("en-US", { ...opts, timeZone });
  } catch {
    return end.toLocaleTimeString("en-US", opts);
  }
}

/** Signs grouped by kind in BE-FAST order; quotes keep transcript order within a kind. */
export function groupSigns(signs: Sign[]): { kind: SignKind; refs: QuoteRef[] }[] {
  return SIGN_ORDER.map((kind) => ({
    kind,
    refs: signs.filter((s) => s.kind === kind).map((s) => s.ref).sort((a, b) => a.tMs - b.tMs),
  })).filter((g) => g.refs.length > 0);
}

const E164_RE = /^\+[1-9]\d{6,14}$/;

/** Accepts "+1 (415) 555-0100", "415-555-0100" (US default) or E.164; returns E.164 or null. */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return E164_RE.test(`+${digits}`) ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** "+19162338165" → "+1 (916) 233-8165"; other E.164 numbers come back unchanged. */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function speakerLabel(s: "caller" | "dispatcher" | "mixed"): string {
  return s === "caller" ? "Caller" : s === "dispatcher" ? "Dispatcher" : "Mic";
}
