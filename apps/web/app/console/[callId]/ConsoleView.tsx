"use client";
import Link from "next/link";
import { useCall } from "@/hooks/useCall";
import { ConnectionBadge } from "@/components/ConnectionBadge";

export function ConsoleView({ callId }: { callId: string }) {
  const call = useCall(callId);
  return (
    <main className="min-h-screen p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-2xl font-semibold tracking-tight">
            LastWell
          </Link>
          <span className="text-lg text-slate-400">Dispatcher console</span>
        </div>
        <ConnectionBadge status={call.connection} />
      </header>
      {call.notFound ? (
        <p className="mt-10 text-xl text-slate-300">Unknown call {callId}.</p>
      ) : (
        <p className="mt-10 text-lg text-slate-300">
          {call.utterances.length} utterances · level {call.state?.level ?? "—"} · call {call.call?.status ?? "—"}
        </p>
      )}
    </main>
  );
}
