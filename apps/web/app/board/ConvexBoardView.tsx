"use client";
// Proposed D-57 (NEXT_PUBLIC_BOARD_LIVE=convex): the board reads Convex directly with a live query
// (convex/board.ts:listAlerts) instead of the gateway WebSocket. The browser holds only
// NEXT_PUBLIC_CONVEX_URL and a short-lived board token from GET /api/board-token (through the proxy,
// so INTERNAL_API_KEY stays server-side). Writes (paramedic confirmation) still go through the gateway,
// which writes them through to Convex, and the query pushes the change back.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ConvexProvider, ConvexReactClient, useConvex, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { AlertSummary } from "@lastwell/core";
import { applyBoardMessage, sortAlerts } from "@/lib/callState";
import { BoardQueryResult, boardSinceMs, tokenRefreshDelayMs } from "@/lib/boardLive";
import { gateway } from "@/lib/gateway";
import { HISTORY_MAX_PAGES, HISTORY_PAGE_SIZE, HistoryPage, historyCsvFile, historyFilename, type HistoryRow } from "@/lib/history";
import { BoardLayout } from "./BoardView";

const listAlertsRef = makeFunctionReference<"query", { token: string; sinceMs: number }, unknown>("board:listAlerts");
const alertHistoryRef = makeFunctionReference<
  "query",
  { token: string; sinceMs: number; untilMs: number; paginationOpts: { numItems: number; cursor: string | null } },
  unknown
>("board:alertHistory");

const RETRY_MS = 3_000;
const MIN_RENEW_GAP_MS = 5_000;

export function ConvexBoardView() {
  const empty = (text: string) => <BoardLayout alerts={[]} labels={{}} connection="connecting" onAlert={() => {}} indicator={<ConvexIndicator text={text} />} />;
  return (
    <ConvexShell unset={empty("Convex: NEXT_PUBLIC_CONVEX_URL unset")} connecting={empty("live: Convex")}>
      <LiveConvexBoard />
    </ConvexShell>
  );
}

/** A ConvexProvider for NEXT_PUBLIC_CONVEX_URL, shared by the board and the evidence page. */
export function ConvexShell({ unset, connecting, children }: { unset: ReactNode; connecting: ReactNode; children: ReactNode }) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  // One client per mount, created and closed by the same effect: StrictMode's mount → unmount → mount
  // must not reuse a client the first cleanup already closed.
  const [client, setClient] = useState<ConvexReactClient | null>(null);
  useEffect(() => {
    if (!url) return;
    const c = new ConvexReactClient(url);
    setClient(c);
    return () => {
      setClient(null);
      void c.close();
    };
  }, [url]);
  if (!url) return unset;
  if (!client) return connecting;
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}

export function ConvexIndicator({ text }: { text: string }) {
  return (
    <span data-testid="board-live-mode" data-mode="convex" className="rounded-full bg-lw-accent-soft px-3 py-1 text-sm font-semibold text-lw-accent-text ring-1 ring-lw-accent-border">
      {text}
    </span>
  );
}

/** A board token, renewed at half its lifetime, and on demand (at most every 5 s) when Convex says it expired. */
export function useBoardToken(): { args: { token: string; sinceMs: number } | null; renew: () => void } {
  const [args, setArgs] = useState<{ token: string; sinceMs: number } | null>(null);
  const [nonce, setNonce] = useState(0);
  const lastRenew = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fetchToken = async () => {
      try {
        const t = await gateway.boardToken();
        if (cancelled) return;
        setArgs({ token: t.token, sinceMs: boardSinceMs(Date.now()) });
        timer = setTimeout(fetchToken, tokenRefreshDelayMs(t.expiresInS));
      } catch {
        if (!cancelled) timer = setTimeout(fetchToken, RETRY_MS);
      }
    };
    void fetchToken();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [nonce]);

  const renew = () => {
    if (Date.now() - lastRenew.current < MIN_RENEW_GAP_MS) return;
    lastRenew.current = Date.now();
    setNonce((n) => n + 1);
  };
  return { args, renew };
}

function LiveConvexBoard() {
  const { args, renew } = useBoardToken();
  const raw = useQuery(listAlertsRef, args ?? "skip");
  const [board, setBoard] = useState<{ alerts: AlertSummary[]; labels: Record<string, string> } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (raw === undefined) return; // loading or switching tokens: keep the last list on screen
    const parsed = BoardQueryResult.safeParse(raw);
    if (!parsed.success) {
      setProblem("unexpected data");
      return;
    }
    if (!parsed.data.ok) {
      setProblem("token expired, renewing");
      renew();
      return;
    }
    setProblem(null);
    const labels: Record<string, string> = {};
    for (const it of parsed.data.items) if (it.label) labels[it.alert.callId] = it.label;
    setBoard({ alerts: sortAlerts(parsed.data.items.map((it) => it.alert)), labels });
    // renew is stable enough: it only bumps a counter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  // The gateway's reply to a paramedic toggle shows at once; the live query confirms it a moment later.
  const onAlert = (a: AlertSummary) =>
    setBoard((prev) => (prev ? { ...prev, alerts: applyBoardMessage(prev.alerts, { type: "alert.updated", alert: a }) } : prev));

  return (
    <BoardLayout
      alerts={board?.alerts ?? []}
      labels={board?.labels ?? {}}
      connection={board && problem === null ? "live" : "connecting"}
      onAlert={onAlert}
      evidenceHref={(a) => `/board/${encodeURIComponent(a.callId)}`}
      indicator={
        <>
          <ExportHistory token={args?.token ?? null} onUnauthorized={renew} />
          <ConvexIndicator text={problem ? `live: Convex (${problem})` : "live: Convex"} />
        </>
      }
    />
  );
}

/**
 * "Export history": the last 24 h of alerts as CSV, read page by page with one-shot Convex queries
 * (board:alertHistory, same board token, quoted evidence only). Read-only; nothing leaves the browser
 * except the file the user saves.
 */
function ExportHistory({ token, onUnauthorized }: { token: string | null; onUnauthorized: () => void }) {
  const convex = useConvex();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    if (!token) return;
    setBusy(true);
    setNote(null);
    try {
      const now = Date.now();
      const rows: HistoryRow[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < HISTORY_MAX_PAGES; i++) {
        const raw = await convex.query(alertHistoryRef, { token, sinceMs: now - 24 * 3600_000, untilMs: now + 1, paginationOpts: { numItems: HISTORY_PAGE_SIZE, cursor } });
        const page = HistoryPage.safeParse(raw);
        if (!page.success) throw new Error("unexpected data from Convex");
        if (!page.data.ok) {
          onUnauthorized();
          throw new Error("board token expired, try again in a moment");
        }
        rows.push(...page.data.rows);
        if (page.data.isDone) break;
        cursor = page.data.continueCursor;
      }
      const url = URL.createObjectURL(new Blob([historyCsvFile(rows)], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = historyFilename(new Date(now));
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNote(`${rows.length} alert${rows.length === 1 ? "" : "s"} exported`);
    } catch (err) {
      setNote(`Export failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex items-center gap-2">
      {note && (
        <span data-testid="export-history-note" className="whitespace-nowrap text-sm text-lw-ink-2">
          {note}
        </span>
      )}
      <button
        type="button"
        data-testid="export-history"
        disabled={!token || busy}
        onClick={run}
        className="whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold text-lw-ink ring-1 ring-lw-border hover:bg-lw-subtle disabled:opacity-50"
      >
        {busy ? "Exporting…" : "Export history (24 h)"}
      </button>
    </span>
  );
}
