"use client";
// D-56: one light nav bar on every page. The mic page stays reachable at /mic but has no tab.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoardIcon, PhoneIcon } from "./icons";
import { Logo } from "./Logo";

const TABS = [
  { href: "/", label: "Calls", Icon: PhoneIcon, active: (p: string) => p === "/" || p.startsWith("/console") },
  { href: "/board", label: "Pre-alert board", Icon: BoardIcon, active: (p: string) => p.startsWith("/board") },
];

export function AppNav({ children }: { children?: React.ReactNode }) {
  const path = usePathname() ?? "/";
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-lw-border bg-lw-surface px-7 py-3">
      <div className="flex items-center gap-8">
        <Link href="/" aria-label="LastWell home">
          <Logo />
        </Link>
        <nav className="flex gap-1.5" aria-label="Pages">
          {TABS.map(({ href, label, Icon, active }) => {
            const on = active(path);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-base font-semibold ${
                  on ? "bg-lw-subtle text-lw-ink" : "text-lw-ink-2 hover:bg-lw-subtle hover:text-lw-ink"
                }`}
              >
                <Icon className={on ? "text-lw-accent" : "text-lw-ink-3"} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children && <div className="flex items-center gap-5">{children}</div>}
    </header>
  );
}

/** The WebSocket badge appears only when the link is not live (docs/01 §7 degraded mode). */
export function LinkStatus({ status }: { status: "connecting" | "live" | "polling" }) {
  if (status === "live") return null;
  return (
    <span
      data-testid="connection-status"
      data-status={status}
      className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${
        status === "polling" ? "bg-amber-50 text-amber-900 ring-amber-300" : "bg-lw-subtle text-lw-ink-2 ring-lw-border"
      }`}
    >
      {status === "polling" ? "Polling (link down)" : "Connecting…"}
    </span>
  );
}
