"use client";
// Dispatcher console (docs/01 §7, D-54): light theme sized for a 1920×1080 screen. Left: live
// transcript. Right: next question, signs + facts, send bar. Latency and the pre-flight test links
// show only with ?debug (and the test links on /preflight).
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { CallInfo } from "@lastwell/core";
import { useCall } from "@/hooks/useCall";
import { AppNav, LinkStatus } from "@/components/AppNav";
import { Transcript } from "@/components/console/Transcript";
import { StrokeCard } from "@/components/console/StrokeCard";
import { FactsPanel, LatencyReadout, LookalikePanel, NextQuestionBanner, WarningBanners } from "@/components/console/Panels";
import { SendAlert, TestLinks } from "@/components/console/SendAlert";
import { useConfig } from "@/hooks/useConfig";
import { mmss, stateRefs } from "@/lib/format";
import { useNow } from "@/hooks/useNow";

export function ConsoleView({ callId }: { callId: string }) {
  const view = useCall(callId);
  const { config } = useConfig();
  const refs = useMemo(() => stateRefs(view.state), [view.state]);
  const call = view.call;
  const debug = useDebugFlag();
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <main className="flex h-screen flex-col bg-lw-page text-lw-ink [color-scheme:light]">
      <AppNav>
        <LinkStatus status={view.connection} />
        {call && <CallState status={call.status} />}
        {call && <CallTimer startedAt={call.startedAt} endedAt={call.endedAt} />}
      </AppNav>

      {view.notFound ? (
        <p className="mx-7 mt-10 text-xl text-lw-ink-2">
          Unknown call <span className="font-mono">{callId}</span>.{" "}
          <Link className="text-lw-accent-text underline" href="/">
            Back to calls
          </Link>
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 px-7 py-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex min-h-0 flex-col">
            <Transcript utterances={view.utterances} partials={view.partials} refs={refs} />
          </div>
          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto">
            <WarningBanners state={view.state} />
            <NextQuestionBanner state={view.state} live={!call || call.status === "live"} />
            <div className="grid flex-1 grid-cols-1 gap-5 xl:grid-cols-2">
              <div className="flex flex-col gap-5 [&>section:first-child]:flex-1">
                <StrokeCard state={view.state} />
                <LookalikePanel state={view.state} />
              </div>
              <FactsPanel state={view.state} />
            </div>
            <SendAlert
              callId={callId}
              call={call}
              state={view.state}
              alerts={view.alerts}
              config={config}
              onAlert={view.upsertAlert}
            />
            {debug && (
              <section
                data-testid="debug"
                className="flex flex-col gap-2 rounded-2xl border border-dashed border-lw-border-strong px-7 py-4"
              >
                <LatencyReadout state={view.state} />
                <TestLinks config={config} onNotice={setNotice} />
                {notice && (
                  <p data-testid="test-notice" className="text-sm text-lw-ink-2">
                    {notice}
                  </p>
                )}
              </section>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/** `?debug` in the URL; false during server rendering so hydration matches. */
function useDebugFlag(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).has("debug"),
    () => false,
  );
}

const CALL_STATE: Record<CallInfo["status"], { text: string; dot: string }> = {
  live: { text: "On the line", dot: "bg-lw-danger" },
  ended: { text: "Call ended", dot: "bg-lw-ink-3" },
  failed: { text: "Call failed", dot: "bg-amber-500" },
};

function CallState({ status }: { status: CallInfo["status"] }) {
  const s = CALL_STATE[status];
  return (
    <span data-testid="call-status" data-status={status} className="inline-flex items-center gap-2 text-base font-semibold text-lw-ink-2">
      <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
      {s.text}
    </span>
  );
}

function CallTimer({ startedAt, endedAt }: { startedAt: string; endedAt: string | null }) {
  const now = useNow(1000);
  const ms = (endedAt ? Date.parse(endedAt) : now.getTime()) - Date.parse(startedAt);
  return (
    <span data-testid="call-timer" className="font-mono text-2xl font-semibold text-lw-ink tabular-nums" title="Call duration">
      {mmss(ms)}
    </span>
  );
}
