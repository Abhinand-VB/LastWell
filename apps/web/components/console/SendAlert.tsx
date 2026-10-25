"use client";
// W-05: Send stroke pre-alert (docs/01 §7, D-30, D-35). Enabled at level ≠ none, also while the
// 911 call is live (the target is the medical professional's phone, not the caller's). The modal
// prefills ALERT_DEFAULT_TARGET_PHONE from /api/config and requires an explicit confirm.
// W-12 (D-43): with alertDelivery "local" no call is placed; Play briefing plays the WAV here.
import { useEffect, useRef, useState } from "react";
import type { AlertSummary, CallInfo, CaseState } from "@lastwell/core";
import { gateway } from "@/lib/gateway";
import {
  HANGUP_STATUSES,
  RETRY_STATUSES,
  canPlay,
  isActive,
  latestAlert,
  sendErrorText,
  statusLabel,
  statusSteps,
  stepIndex,
} from "@/lib/alerts";
import { useBriefingPlayer } from "@/hooks/useBriefingPlayer";
import { toE164 } from "@/lib/format";
import type { WebConfig } from "@/lib/config";

export function SendAlert({
  callId,
  call,
  state,
  alerts,
  config,
  onAlert,
}: {
  callId: string;
  call: CallInfo | null;
  state: CaseState | null;
  alerts: AlertSummary[];
  config: WebConfig;
  onAlert: (a: AlertSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const level = state?.level ?? "none";
  const current = latestAlert(alerts);
  const active = isActive(current);
  const disabled = level === "none" || active || !call;
  const reason =
    level === "none"
      ? "Enabled once a stroke sign is heard"
      : active
        ? "A pre-alert for this call is already in progress"
        : !call
          ? "Loading the call…"
          : "Send a stroke pre-alert to the stroke team";

  return (
    <section data-testid="send-alert" className="rounded-2xl bg-slate-900/80 p-5 ring-1 ring-slate-700/60">
      <button
        type="button"
        data-testid="send-button"
        disabled={disabled}
        title={reason}
        onClick={() => setOpen(true)}
        className="w-full rounded-xl bg-red-600 px-6 py-4 text-2xl font-bold text-white shadow-lg transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
      >
        Send stroke pre-alert
      </button>
      {level === "none" && <p className="mt-2 text-center text-base text-slate-400">{reason}</p>}

      {current && <AlertStatusPanel alert={current} config={config} onAlert={onAlert} />}

      <TestLinks config={config} onNotice={setNotice} />
      {notice && (
        <p data-testid="test-notice" className="mt-2 text-sm text-slate-300">
          {notice}
        </p>
      )}

      {open && call && (
        <SendModal
          callId={callId}
          call={call}
          config={config}
          onClose={() => setOpen(false)}
          onSent={(a) => {
            onAlert(a);
            setOpen(false);
          }}
        />
      )}
    </section>
  );
}

function SendModal({
  callId,
  call,
  config,
  onClose,
  onSent,
}: {
  callId: string;
  call: CallInfo;
  config: WebConfig;
  onClose: () => void;
  onSent: (a: AlertSummary) => void;
}) {
  const [phone, setPhone] = useState(config.alertDefaultTargetPhone ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const e164 = toE164(phone);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!e164 || !confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await gateway.sendAlert(callId, e164);
      onSent(res.alert);
    } catch (err) {
      setError(sendErrorText(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-title"
    >
      <form
        onSubmit={submit}
        data-testid="send-modal"
        className="w-full max-w-xl rounded-2xl bg-slate-900 p-8 shadow-2xl ring-1 ring-slate-600"
      >
        <h2 id="send-title" className="text-3xl font-bold text-white">
          Send stroke pre-alert
        </h2>
        <p className="mt-2 text-lg text-slate-300">
          {config.alertDelivery === "local"
            ? "The spoken briefing, built from the quotes on this card, will be ready to play from this laptop."
            : "The stroke team’s phone will ring and hear a spoken briefing built from the quotes on this card."}
        </p>
        {call.status === "live" && (
          <p data-testid="caller-on-line" className="mt-4 rounded-lg bg-sky-500/10 px-4 py-2 text-base text-sky-200 ring-1 ring-sky-400/40">
            Caller still on the line — this does not end or change the 911 call.
          </p>
        )}

        <label className="mt-6 block text-base font-semibold text-slate-300" htmlFor="target-phone">
          Stroke team phone
        </label>
        <input
          id="target-phone"
          ref={input}
          data-testid="target-phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 415 555 0100"
          className="mt-2 w-full rounded-xl bg-slate-950 px-4 py-3 font-mono text-2xl text-white ring-1 ring-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        <p className="mt-1 text-sm text-slate-400">
          {config.alertDefaultTargetPhone
            ? "Prefilled with the on-call stroke team number."
            : "No default number configured — type the stroke team's number."}
          {phone && !e164 && <span className="ml-2 text-amber-300">Not a valid phone number.</span>}
        </p>

        <label className="mt-6 flex cursor-pointer items-start gap-3 text-lg text-slate-200">
          <input
            type="checkbox"
            data-testid="confirm-checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 h-6 w-6 accent-red-500"
          />
          I confirm sending a dispatcher pre-alert to this number.
        </label>

        {error && (
          <p data-testid="send-error" role="alert" className="mt-5 rounded-lg bg-red-500/15 px-4 py-3 text-lg font-semibold text-red-200 ring-1 ring-red-400/60">
            {error}
          </p>
        )}

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-5 py-3 text-lg font-semibold text-slate-300 ring-1 ring-slate-600 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="modal-send"
            disabled={!e164 || !confirmed || busy}
            className="rounded-xl bg-red-600 px-6 py-3 text-lg font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AlertStatusPanel({
  alert,
  config,
  onAlert,
}: {
  alert: AlertSummary;
  config: WebConfig;
  onAlert: (a: AlertSummary) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const delivery = config.alertDelivery;
  const player = useBriefingPlayer(onAlert);
  const steps = statusSteps(config.featureQa, delivery);
  const at = stepIndex(alert.status, steps);
  const failed = alert.status === "failed";
  const playing = player.playingId === alert.id && (player.state === "playing" || player.state === "loading");

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(sendErrorText(err).replace(/^Not sent: /, ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="alert-status" data-status={alert.status} className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-base text-slate-400">
          {delivery === "local" ? "Briefing plays from this laptop" : `Pre-alert to ${alert.targetPhoneMasked}`}
        </span>
        <span
          data-testid="alert-status-pill"
          className={`rounded-full px-3 py-1 text-base font-bold ${
            failed ? "bg-red-500 text-white" : alert.status === "completed" ? "bg-emerald-500 text-slate-950" : "bg-sky-400 text-slate-950"
          }`}
        >
          {statusLabel(alert.status, delivery)}
        </span>
      </div>
      {!failed && (
        <ol className="mt-3 flex gap-1.5" aria-label="Alert progress">
          {steps.map((s, i) => (
            <li key={s} className="flex-1">
              <div className={`h-2 rounded-full ${i <= at ? "bg-sky-400" : "bg-slate-700"}`} />
              <div className={`mt-1 text-center text-xs ${i <= at ? "text-sky-200" : "text-slate-500"}`}>{statusLabel(s, delivery)}</div>
            </li>
          ))}
        </ol>
      )}
      {failed && alert.lastError && <p className="mt-2 text-base text-red-200">{alert.lastError}</p>}
      {canPlay(alert, delivery) && (
        <button
          type="button"
          data-testid="play-briefing"
          onClick={() => (playing ? player.stop() : void player.play(alert.id, { report: alert.status !== "completed" }))}
          className="mt-4 w-full rounded-xl bg-emerald-500 px-6 py-3 text-xl font-bold text-slate-950 hover:bg-emerald-400"
        >
          {playing ? "■ Stop" : alert.status === "completed" ? "▶ Play briefing again" : "▶ Play briefing"}
        </button>
      )}
      <div className="mt-3 flex gap-2">
        {delivery === "phone" && RETRY_STATUSES.includes(alert.status) && (
          <button
            type="button"
            data-testid="call-again"
            disabled={busy}
            onClick={() => act(async () => onAlert((await gateway.retry(alert.id)).alert))}
            className="rounded-lg bg-slate-700 px-4 py-2 text-base font-semibold text-white hover:bg-slate-600 disabled:opacity-50"
          >
            Call again
          </button>
        )}
        {delivery === "phone" && HANGUP_STATUSES.includes(alert.status) && (
          <button
            type="button"
            data-testid="hang-up"
            disabled={busy}
            onClick={() => act(async () => void (await gateway.hangup(alert.id)))}
            className="rounded-lg px-4 py-2 text-base font-semibold text-slate-300 ring-1 ring-slate-600 hover:bg-slate-800 disabled:opacity-50"
          >
            Hang up briefing
          </button>
        )}
      </div>
      {(error ?? player.error) && <p className="mt-2 text-sm text-red-300">{error ?? player.error}</p>}
    </div>
  );
}

function TestLinks({ config, onNotice }: { config: WebConfig; onNotice: (s: string) => void }) {
  const local = config.alertDelivery === "local";
  const [testAlert, setTestAlert] = useState<AlertSummary | null>(null);
  const player = useBriefingPlayer((a) => setTestAlert(a));
  const testCall = async () => {
    const raw = window.prompt(
      local ? "Test briefing — number on the alert (no call is placed in local mode):" : "Test briefing call — phone number to ring:",
      config.alertDefaultTargetPhone ?? "",
    );
    if (raw === null) return;
    const e164 = toE164(raw);
    if (!e164) return onNotice("Test briefing not created: not a valid phone number.");
    try {
      const res = await gateway.testBriefing(e164);
      setTestAlert(res.alert);
      onNotice(local ? "Test briefing ready: press Play test briefing." : "Test briefing call placed; it shows on the board with label TEST.");
    } catch (err) {
      onNotice(sendErrorText(err).replace(/^Not sent/, "Test briefing not created"));
    }
  };
  const clear = async () => {
    try {
      const res = await gateway.clearTestAlerts();
      setTestAlert(null);
      onNotice(`Cleared ${res.deleted} test alert${res.deleted === 1 ? "" : "s"}.`);
    } catch (err) {
      onNotice(sendErrorText(err).replace(/^Not sent/, "Not cleared"));
    }
  };
  const playing = testAlert !== null && player.playingId === testAlert.id && (player.state === "playing" || player.state === "loading");
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-5 border-t border-slate-800 pt-3 text-sm">
      <button type="button" data-testid="test-briefing" onClick={testCall} className="text-slate-400 underline hover:text-slate-200">
        {local ? "Test briefing" : "Test briefing call"}
      </button>
      {local && testAlert && canPlay(testAlert, "local") && (
        <button
          type="button"
          data-testid="play-test-briefing"
          onClick={() => (playing ? player.stop() : void player.play(testAlert.id, { report: testAlert.status !== "completed" }))}
          className="rounded-md bg-emerald-500/20 px-3 py-1 font-semibold text-emerald-200 ring-1 ring-emerald-400/60 hover:bg-emerald-500/30"
        >
          {playing ? "■ Stop" : "▶ Play test briefing"}
        </button>
      )}
      <button type="button" data-testid="clear-test" onClick={clear} className="text-slate-400 underline hover:text-slate-200">
        Clear test alerts
      </button>
      {player.error && <span className="w-full text-center text-red-300">{player.error}</span>}
    </div>
  );
}
