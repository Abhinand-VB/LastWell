"use client";
// W-05: Send stroke pre-alert (docs/01 §7, D-30, D-35). Enabled at every level (D-53, W-13), also while
// the 911 call is live (the target is the medical professional's phone, not the caller's). The modal
// preselects ALERT_DEFAULT_TARGET_PHONE among the allowed numbers from /api/config, formatted (D-58), plus
// "Other number" for a typed one, and requires an explicit confirm; below possible
// it says LastWell has no signs and sends override: true. An optional note (≤ 200) is sent as `notes`.
// W-12 (D-43): with alertDelivery "local" no call is placed; Play briefing plays the WAV here.
// D-54: the test links are not on the console during a call; TestLinks lives on /preflight and ?debug.
import { useEffect, useRef, useState } from "react";
import type { AlertSummary, CallInfo, CaseState, Level } from "@lastwell/core";
import { GatewayError, gateway } from "@/lib/gateway";
import {
  HANGUP_STATUSES,
  NOTE_MAX,
  OVERRIDE_TOOLTIP,
  RETRY_STATUSES,
  alertExtras,
  belowPossible,
  canPlay,
  isActive,
  latestAlert,
  phoneChoices,
  sendErrorText,
  statusLabel,
  statusSteps,
  stepIndex,
} from "@/lib/alerts";
import { useBriefingPlayer } from "@/hooks/useBriefingPlayer";
import { formatPhone, toE164 } from "@/lib/format";
import type { WebConfig } from "@/lib/config";

const OTHER = "other";

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
  const level = state?.level ?? "none";
  const current = latestAlert(alerts);
  const active = isActive(current);
  // D-53: enabled at every level; below possible the send is a dispatcher override.
  const override = belowPossible(level);
  const disabled = active || !call;
  const reason = active
    ? "A pre-alert for this call is already in progress"
    : !call
      ? "Loading the call…"
      : override
        ? OVERRIDE_TOOLTIP
        : "Send a stroke pre-alert to the stroke team";
  const target = config.alertDefaultTargetPhone;

  return (
    <section data-testid="send-alert" className="rounded-2xl border border-lw-border bg-lw-surface px-7 py-5">
      {/* While a pre-alert is in progress its status replaces the send row (one line, not two). */}
      <div className={`flex flex-wrap items-center justify-between gap-4 ${active ? "hidden" : ""}`}>
        <p className="text-lg text-lw-ink-2">
          {config.alertDelivery === "local"
            ? "The briefing plays from this laptop"
            : target
              ? `Calls the on-call stroke team (phone ending ${target.slice(-4)})`
              : "Calls the on-call stroke team"}
        </p>
        <button
          type="button"
          data-testid="send-button"
          disabled={disabled}
          title={reason}
          onClick={() => setOpen(true)}
          className="rounded-xl bg-lw-danger px-10 py-4 text-2xl font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-lw-subtle disabled:text-lw-ink-3"
        >
          Send stroke pre-alert
        </button>
      </div>
      {override && !active && call && (
        <p data-testid="override-hint" className="mt-2 text-right text-base text-lw-ink-3">
          {OVERRIDE_TOOLTIP}.
        </p>
      )}

      {current && <AlertStatusPanel alert={current} config={config} onAlert={onAlert} divider={!active} />}

      {open && call && (
        <SendModal
          callId={callId}
          call={call}
          level={level}
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
  level,
  config,
  onClose,
  onSent,
}: {
  callId: string;
  call: CallInfo;
  level: Level;
  config: WebConfig;
  onClose: () => void;
  onSent: (a: AlertSummary) => void;
}) {
  // D-58: the allowed numbers are choices (default first, preselected); "other" keeps the typed field.
  const choices = phoneChoices(config.alertDefaultTargetPhone, config.alertAllowedNumbers);
  const [picked, setPicked] = useState<string>(choices[0] ?? OTHER);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // D-53: a send below possible is an override; a 409 override_required (the gateway has no signs though
  // the console showed some) turns the override notice on for this modal too.
  const [forcedOverride, setForcedOverride] = useState(false);
  const override = belowPossible(level) || forcedOverride;
  const input = useRef<HTMLInputElement>(null);
  const typing = picked === OTHER;
  const e164 = typing ? toE164(phone) : picked;

  useEffect(() => {
    if (typing) input.current?.focus();
  }, [typing]);

  useEffect(() => {
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
      const res = await gateway.sendAlert(callId, e164, alertExtras(note, override));
      onSent(res.alert);
    } catch (err) {
      if (err instanceof GatewayError && err.code === "override_required") {
        setForcedOverride(true);
        setConfirmed(false);
      }
      setError(sendErrorText(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-title"
    >
      <form
        onSubmit={submit}
        data-testid="send-modal"
        className="w-full max-w-xl rounded-2xl bg-lw-surface p-8 shadow-2xl ring-1 ring-lw-border"
      >
        <h2 id="send-title" className="text-3xl font-bold text-lw-ink">
          Send stroke pre-alert
        </h2>
        <p className="mt-2 text-lg text-lw-ink-2">
          {config.alertDelivery === "local"
            ? "The spoken briefing, built from the quotes on this card, will be ready to play from this laptop."
            : "The stroke team’s phone will ring and hear a spoken briefing built from the quotes on this card."}
        </p>
        {call.status === "live" && (
          <p
            data-testid="caller-on-line"
            className="mt-4 rounded-lg bg-lw-accent-soft px-4 py-2 text-base text-lw-accent-text ring-1 ring-lw-accent-border"
          >
            Caller still on the line — this does not end or change the 911 call.
          </p>
        )}
        {override && (
          <p
            data-testid="override-notice"
            className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-base text-amber-900 ring-1 ring-amber-300"
          >
            <strong>LastWell has not detected stroke signs on this call.</strong> The briefing will open: “Dispatcher-initiated
            pre-alert. LastWell has not detected stroke signs on this call.”
          </p>
        )}

        <fieldset className="mt-6">
          <legend className="text-base font-semibold text-lw-ink-2">Stroke team phone</legend>
          {choices.length > 0 && (
            <div className="mt-2 flex flex-col gap-2" role="radiogroup">
              {[...choices, OTHER].map((c) => (
                <label
                  key={c}
                  data-testid="phone-choice"
                  data-phone={c}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 ring-1 ${
                    picked === c ? "bg-lw-accent-soft ring-2 ring-lw-accent" : "ring-lw-border-strong hover:bg-lw-subtle"
                  }`}
                >
                  <input
                    type="radio"
                    name="target-phone-choice"
                    value={c}
                    checked={picked === c}
                    onChange={() => setPicked(c)}
                    className="h-5 w-5 accent-blue-700"
                  />
                  {c === OTHER ? (
                    <span className="text-lg text-lw-ink">Other number</span>
                  ) : (
                    <span className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-mono text-2xl text-lw-ink">{formatPhone(c)}</span>
                      {c === config.alertDefaultTargetPhone && (
                        <span className="text-sm text-lw-ink-3">On-call stroke team (default)</span>
                      )}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
          {typing && (
            <input
              id="target-phone"
              ref={input}
              aria-label="Stroke team phone"
              data-testid="target-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => e164 && setPhone(formatPhone(e164))}
              placeholder="+1 (415) 555-0100"
              className="mt-2 w-full rounded-xl bg-lw-surface px-4 py-3 font-mono text-2xl text-lw-ink ring-1 ring-lw-border-strong focus:outline-none focus:ring-2 focus:ring-lw-accent"
            />
          )}
        </fieldset>
        <p className="mt-1 text-sm text-lw-ink-3">
          {choices.length > 0
            ? typing
              ? "Only numbers on the allowed list can be called."
              : "Prefilled with the on-call stroke team number."
            : "No default number configured — type the stroke team's number."}
          {typing && phone && !e164 && <span className="ml-2 font-semibold text-amber-800">Not a valid phone number.</span>}
        </p>

        <div className="mt-6 flex items-baseline justify-between">
          <label className="text-base font-semibold text-lw-ink-2" htmlFor="dispatcher-note">
            Dispatcher note <span className="font-normal text-lw-ink-3">(optional)</span>
          </label>
          <span
            data-testid="note-counter"
            aria-live="polite"
            className={`font-mono text-sm ${note.length >= NOTE_MAX ? "font-semibold text-amber-800" : "text-lw-ink-3"}`}
          >
            {note.length}/{NOTE_MAX}
          </span>
        </div>
        <textarea
          id="dispatcher-note"
          data-testid="dispatcher-note"
          value={note}
          maxLength={NOTE_MAX}
          rows={3}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
          placeholder="What you know that the transcript does not, e.g. “Wife says he slurred his words at breakfast.”"
          className="mt-2 w-full resize-none rounded-xl bg-lw-surface px-4 py-3 text-lg text-lw-ink ring-1 ring-lw-border-strong focus:outline-none focus:ring-2 focus:ring-lw-accent"
        />
        <p className="mt-1 text-sm text-lw-ink-3">Read word for word at the end of the briefing, after “The dispatcher adds:”.</p>

        <label className="mt-6 flex cursor-pointer items-start gap-3 text-lg text-lw-ink">
          <input
            type="checkbox"
            data-testid="confirm-checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 h-6 w-6 accent-red-600"
          />
          {override
            ? "I confirm sending a dispatcher-initiated pre-alert to this number without LastWell stroke signs."
            : "I confirm sending a dispatcher pre-alert to this number."}
        </label>

        {error && (
          <p
            data-testid="send-error"
            role="alert"
            className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-lg font-semibold text-red-800 ring-1 ring-red-300"
          >
            {error}
          </p>
        )}

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-5 py-3 text-lg font-semibold text-lw-ink-2 ring-1 ring-lw-border-strong hover:bg-lw-subtle"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="modal-send"
            disabled={!e164 || !confirmed || busy}
            className="rounded-xl bg-lw-danger px-6 py-3 text-lg font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-lw-subtle disabled:text-lw-ink-3"
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
  divider,
}: {
  alert: AlertSummary;
  config: WebConfig;
  onAlert: (a: AlertSummary) => void;
  divider: boolean;
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
    <div data-testid="alert-status" data-status={alert.status} className={divider ? "mt-4 border-t border-lw-border pt-4" : ""}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-base text-lw-ink-2">
          {delivery === "local"
            ? "The briefing plays from this laptop"
            : `Stroke team pre-alert (phone ending ${alert.targetPhoneMasked.replace(/\D/g, "").slice(-4)})`}
        </span>
        <span
          data-testid="alert-status-pill"
          className={`rounded-full px-3 py-1 text-base font-bold ${
            failed ? "bg-lw-danger text-white" : alert.status === "completed" ? "bg-emerald-600 text-white" : "bg-lw-accent text-white"
          }`}
        >
          {statusLabel(alert.status, delivery)}
        </span>
      </div>
      {!failed && alert.status !== "completed" && (
        <ol className="mt-3 flex gap-1.5" aria-label="Alert progress">
          {steps.map((s, i) => (
            <li key={s} className="flex-1">
              <div className={`h-2 rounded-full ${i <= at ? "bg-lw-accent" : "bg-lw-border"}`} />
              <div className={`mt-1 text-center text-xs ${i <= at ? "font-semibold text-lw-accent-text" : "text-lw-ink-3"}`}>
                {statusLabel(s, delivery)}
              </div>
            </li>
          ))}
        </ol>
      )}
      {failed && alert.lastError && <p className="mt-2 text-base text-red-800">{alert.lastError}</p>}
      {canPlay(alert, delivery) && (
        <button
          type="button"
          data-testid="play-briefing"
          onClick={() => (playing ? player.stop() : void player.play(alert.id, { report: alert.status !== "completed" }))}
          className="mt-4 w-full rounded-xl bg-emerald-600 px-6 py-3 text-xl font-bold text-white hover:bg-emerald-700"
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
            className="rounded-lg bg-lw-ink px-4 py-2 text-base font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
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
            className="rounded-lg px-4 py-2 text-base font-semibold text-lw-ink-2 ring-1 ring-lw-border-strong hover:bg-lw-subtle disabled:opacity-50"
          >
            Hang up briefing
          </button>
        )}
      </div>
      {(error ?? player.error) && <p className="mt-2 text-sm text-red-700">{error ?? player.error}</p>}
    </div>
  );
}

/** Pre-flight test actions (docs/08 §4): on /preflight and the console's ?debug view, never on the live console. */
export function TestLinks({ config, onNotice }: { config: WebConfig; onNotice: (s: string) => void }) {
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
    <div className="flex flex-wrap items-center gap-5 text-base">
      <button type="button" data-testid="test-briefing" onClick={testCall} className="text-lw-ink-2 underline hover:text-lw-ink">
        {local ? "Test briefing" : "Test briefing call"}
      </button>
      {local && testAlert && canPlay(testAlert, "local") && (
        <button
          type="button"
          data-testid="play-test-briefing"
          onClick={() => (playing ? player.stop() : void player.play(testAlert.id, { report: testAlert.status !== "completed" }))}
          className="rounded-md bg-emerald-50 px-3 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-100"
        >
          {playing ? "■ Stop" : "▶ Play test briefing"}
        </button>
      )}
      <button type="button" data-testid="clear-test" onClick={clear} className="text-lw-ink-2 underline hover:text-lw-ink">
        Clear test alerts
      </button>
      {player.error && <span className="w-full text-red-700">{player.error}</span>}
    </div>
  );
}
