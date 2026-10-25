import type { ConnectionStatus } from "@/hooks/useCall";

const STYLES: Record<ConnectionStatus, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40" },
  connecting: { label: "Connecting…", cls: "bg-slate-500/15 text-slate-300 ring-slate-400/40" },
  polling: { label: "Polling (link down)", cls: "bg-yellow-400/15 text-yellow-200 ring-yellow-300/50" },
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const s = STYLES[status];
  return (
    <span
      data-testid="connection-status"
      data-status={status}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ring-1 ${s.cls}`}
    >
      <span className={`h-2 w-2 rounded-full ${status === "live" ? "bg-emerald-400" : status === "polling" ? "bg-yellow-300" : "bg-slate-400"}`} />
      {s.label}
    </span>
  );
}
