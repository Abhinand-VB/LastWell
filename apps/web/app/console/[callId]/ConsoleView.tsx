"use client";
// Dispatcher console (docs/01 §7): left 55 % live transcript, right 45 % stacked card.
import Link from "next/link";
import { useMemo } from "react";
import { useCall } from "@/hooks/useCall";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { Transcript } from "@/components/console/Transcript";
import { StrokeCard } from "@/components/console/StrokeCard";
import { FactsPanel, LatencyReadout, LookalikePanel, NextQuestionBanner, WarningBanners } from "@/components/console/Panels";
import { SendAlert } from "@/components/console/SendAlert";
import { useConfig } from "@/hooks/useConfig";
import { stateRefs } from "@/lib/format";

export function ConsoleView({ callId }: { callId: string }) {
  const view = useCall(callId);
  const { config } = useConfig();
  const refs = useMemo(() => stateRefs(view.state), [view.state]);
  const call = view.call;

  return (
    <main className="flex h-screen flex-col gap-4 p-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-4">
          <Link href="/" className="text-2xl font-bold tracking-tight text-white">
            LastWell
          </Link>
          <span className="text-lg text-slate-400">Dispatcher console</span>
          {call && (
            <span data-testid="call-meta" className="text-lg text-slate-300">
              {call.label ? `${call.label} · ` : ""}
              {call.mode === "phone" ? (call.callerNumberMasked ?? "phone call") : call.mode}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {call && (
            <span
              data-testid="call-status"
              data-status={call.status}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                call.status === "live" ? "bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/50" : "bg-slate-700 text-slate-300"
              }`}
            >
              {call.status === "live" ? "Caller still on the line" : call.status === "ended" ? "Call ended" : "Call failed"}
            </span>
          )}
          <ConnectionBadge status={view.connection} />
        </div>
      </header>

      {view.notFound ? (
        <p className="mt-10 text-xl text-slate-300">
          Unknown call <span className="font-mono">{callId}</span>.{" "}
          <Link className="text-sky-300 underline" href="/">
            Back to calls
          </Link>
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[55fr_45fr]">
          <div className="flex min-h-0 flex-col">
            <Transcript utterances={view.utterances} partials={view.partials} refs={refs} />
          </div>
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
            <WarningBanners state={view.state} />
            <StrokeCard state={view.state} />
            <SendAlert
              callId={callId}
              call={call}
              state={view.state}
              alerts={view.alerts}
              config={config}
              onAlert={view.upsertAlert}
            />
            <NextQuestionBanner state={view.state} />
            <LookalikePanel state={view.state} />
            <FactsPanel state={view.state} />
            <LatencyReadout state={view.state} />
          </div>
        </div>
      )}
    </main>
  );
}
