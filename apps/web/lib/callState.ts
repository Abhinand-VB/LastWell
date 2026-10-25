// Pure client-side store for one call: applies the docs/03 §5 server messages and rules.
// The hook in hooks/useCall.ts wraps this; keeping it pure makes the rules unit-testable.
import type {
  AlertSummary,
  CallInfo,
  CallSnapshot,
  CaseState,
  Speaker,
  UiServerMessage,
  Utterance,
} from "@lastwell/core";

export interface PartialLine {
  speaker: Speaker;
  text: string;
  tStartMs: number;
}

export interface CallView {
  callId: string;
  call: CallInfo | null;
  utterances: Utterance[];
  /** One partial line per speaker, replaced in place, removed on that speaker's final. */
  partials: PartialLine[];
  state: CaseState | null;
  alerts: AlertSummary[];
}

export function emptyCallView(callId: string): CallView {
  return { callId, call: null, utterances: [], partials: [], state: null, alerts: [] };
}

function sortedBySeq(list: Utterance[]): Utterance[] {
  return [...list].sort((a, b) => a.seq - b.seq);
}

function mergeUtterances(existing: Utterance[], incoming: Utterance[]): Utterance[] {
  const byId = new Map(existing.map((u) => [u.id, u]));
  for (const u of incoming) byId.set(u.id, u);
  return sortedBySeq([...byId.values()]);
}

/** Drops a state whose version is lower than the one held (docs/03 §5). */
function newerState(held: CaseState | null, next: CaseState): CaseState {
  return held && next.version < held.version ? held : next;
}

function upsertAlert(alerts: AlertSummary[], alert: AlertSummary): AlertSummary[] {
  const i = alerts.findIndex((a) => a.id === alert.id);
  if (i === -1) return [...alerts, alert];
  const copy = [...alerts];
  copy[i] = alert;
  return copy;
}

/** A snapshot (WS or REST poll) replaces everything except a newer state we already hold. */
export function applySnapshot(view: CallView, snap: CallSnapshot): CallView {
  if (snap.callId !== view.callId) return view;
  // Keep finals that arrived after the snapshot was taken (polling can race the socket).
  const utterances = mergeUtterances(snap.utterances, view.utterances.filter((u) => u.callId === snap.callId));
  return {
    callId: view.callId,
    call: snap.call,
    utterances,
    // Partials are transient; a live speaker's next partial arrives within a fraction of a second.
    partials: [],
    state: newerState(view.state, snap.state),
    alerts: snap.alerts,
  };
}

export function applyMessage(view: CallView, msg: UiServerMessage): CallView {
  switch (msg.type) {
    case "snapshot":
      return applySnapshot(view, msg);
    case "utterance.partial": {
      if (msg.callId !== view.callId) return view;
      const others = view.partials.filter((p) => p.speaker !== msg.speaker);
      return { ...view, partials: [...others, { speaker: msg.speaker, text: msg.text, tStartMs: msg.tStartMs }] };
    }
    case "utterance.final": {
      if (msg.callId !== view.callId) return view;
      return {
        ...view,
        utterances: mergeUtterances(view.utterances, [msg.utterance]),
        partials: view.partials.filter((p) => p.speaker !== msg.utterance.speaker),
      };
    }
    case "state.updated":
      if (msg.callId !== view.callId) return view;
      return { ...view, state: newerState(view.state, msg.state) };
    case "alert.updated":
      if (msg.alert.callId !== view.callId) return view;
      return { ...view, alerts: upsertAlert(view.alerts, msg.alert) };
    case "alert.removed":
      return { ...view, alerts: view.alerts.filter((a) => a.id !== msg.alertId) };
    case "call.ended":
      if (msg.callId !== view.callId || !view.call) return view;
      return { ...view, call: { ...view.call, status: "ended", endedAt: msg.endedAt }, partials: [] };
    default:
      return view;
  }
}

/** Board: alerts keyed by id, newest first. */
export function applyBoardMessage(alerts: AlertSummary[], msg: UiServerMessage): AlertSummary[] {
  switch (msg.type) {
    case "board.snapshot":
      return sortAlerts(msg.alerts);
    case "alert.updated":
      return sortAlerts(upsertAlert(alerts, msg.alert));
    case "alert.removed":
      return alerts.filter((a) => a.id !== msg.alertId);
    default:
      return alerts;
  }
}

export function sortAlerts(alerts: AlertSummary[]): AlertSummary[] {
  return [...alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
