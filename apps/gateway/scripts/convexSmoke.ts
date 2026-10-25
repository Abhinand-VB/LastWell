// Proposed D-57: end-to-end smoke test of the Convex features against a RUNNING stack — a gateway with
// FEATURE_CONVEX_BOARD, CONVEX_AUDIO_STORAGE and CONVEX_CALL_RATE_LIMIT on (phone delivery, LASTWELL_FAKES
// including twilio so no real phone rings) and its Convex deployment. Not part of `pnpm verify`: it needs
// the live services (real Claude for the replay) and costs a few cents.
//
//   SMOKE_GATEWAY_URL=http://localhost:8797 SMOKE_CONVEX_URL=http://127.0.0.1:3210 SMOKE_INTERNAL_KEY=<key> \
//     pnpm --filter @lastwell/gateway smoke:convex            # add SMOKE_EXPIRY=1 for the 10-minute token-expiry check
//
// Optional: SMOKE_APPROVE_PHONE (default +14155550102) and SMOKE_LIMIT_PHONE (default +14155550100), both
// must be in the gateway's ALERT_ALLOWED_NUMBERS.
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const env = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    console.error(`missing ${name} (see the header of scripts/convexSmoke.ts)`);
    process.exit(2);
  }
  return v;
};

const GATEWAY = env("SMOKE_GATEWAY_URL", "http://localhost:8797").replace(/\/+$/, "");
const CONVEX = env("SMOKE_CONVEX_URL");
const KEY = env("SMOKE_INTERNAL_KEY");
const APPROVE_PHONE = env("SMOKE_APPROVE_PHONE", "+14155550102");
const LIMIT_PHONE = env("SMOKE_LIMIT_PHONE", "+14155550100");
const EXPIRY = process.env.SMOKE_EXPIRY === "1";

/** Strings that must never reach the stroke team's screens or the export. */
const LEAKS = ["+1415555", "Main St", "Fell Street", "Stroke pre-alert", "utteranceId", "targetPhone", "briefingText"];

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gw(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${GATEWAY}${path}`, {
    method,
    headers: { "x-internal-key": KEY, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // not JSON
  }
  return { status: res.status, json };
}

async function until<T>(what: string, ms: number, probe: () => Promise<T | null> | T | null): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await probe();
    if (v !== null) return v;
    if (Date.now() > end) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
    await sleep(500);
  }
}

type BoardItem = { label: string | null; alert: { id: string; callId: string; status: string } };
type BoardResult = { ok: true; items: BoardItem[] } | { ok: false; error: string };

async function main(): Promise<void> {
  const health = await gw("GET", "/healthz");
  if (health.status !== 200) throw new Error(`gateway not healthy at ${GATEWAY} (${health.status})`);
  console.log(`gateway ${GATEWAY} fakes=${JSON.stringify(health.json.fakes)} · convex ${CONVEX}\n`);

  // 1. Board token
  const tok = await gw("GET", "/api/board-token");
  const token = typeof tok.json.token === "string" ? tok.json.token : "";
  const ttl = Number(tok.json.expiresInS);
  record("board token issued", tok.status === 200 && /^[0-9a-f]{64}$/.test(token) && ttl > 590 && ttl <= 600, `HTTP ${tok.status}, 64-hex token, expiresInS=${ttl}`);
  if (!token) throw new Error("no board token: is FEATURE_CONVEX_BOARD=true and INTERNAL_API_KEY set in the deployment?");

  // 2. Live subscription (what the board's useQuery does)
  const live = new ConvexClient(CONVEX);
  const pushes: BoardResult[] = [];
  const sinceMs = Date.now() - 24 * 3600_000;
  live.onUpdate(anyApi.board!.listAlerts!, { token, sinceMs }, (r: BoardResult) => void pushes.push(r));
  const first = await until("the first board push", 15_000, () => pushes[0] ?? null);
  record("board subscription returns data", first.ok, first.ok ? `${first.items.length} alerts on the board` : first.error);
  const before = pushes.length;

  // 3. A real replay call, approved → the card must be PUSHED to the subscription (no polling, no reload)
  const replay = await gw("POST", "/api/calls/replay", { scriptId: "A01", speed: 4 });
  const callId = String(replay.json.callId ?? "");
  if (!callId) throw new Error(`replay failed: HTTP ${replay.status} ${JSON.stringify(replay.json)}`);
  await until("A01 to reach likely", 120_000, async () => {
    const c = await gw("GET", `/api/calls/${callId}`);
    return (c.json.state as { level?: string } | undefined)?.level === "likely" ? true : null;
  });
  let approve = await gw("POST", `/api/calls/${callId}/alert`, { targetPhone: APPROVE_PHONE, confirm: true });
  // A rerun within 10 minutes can hit the rate limit on the approve number (the feature under test):
  // wait out a short window once, then retry.
  const limited = (approve.json.error as { code?: string; message?: string } | undefined) ?? {};
  const waitS = Number(/try again in (\d+) s/.exec(limited.message ?? "")?.[1] ?? NaN);
  if (approve.status === 409 && limited.code === "rate_limited" && waitS <= 180) {
    console.log(`(approve number is rate-limited from an earlier run; waiting ${waitS} s)`);
    await sleep((waitS + 2) * 1000);
    approve = await gw("POST", `/api/calls/${callId}/alert`, { targetPhone: APPROVE_PHONE, confirm: true });
  }
  const alertId = String((approve.json.alert as { id?: string } | undefined)?.id ?? "");
  record("alert approved", approve.status === 200 && alertId !== "", `HTTP ${approve.status} ${approve.status === 200 ? alertId : JSON.stringify(approve.json)}`);
  if (!alertId) throw new Error("approve failed; cannot continue");

  const pushedNew = await until("the new alert to be pushed", 15_000, () => {
    for (const r of pushes.slice(before)) if (r.ok && r.items.some((i) => i.alert.id === alertId)) return r;
    return null;
  }).catch(() => null);
  const card = pushedNew?.ok ? pushedNew.items.find((i) => i.alert.id === alertId) : undefined;
  record("live query pushes the new alert", card !== undefined, card ? `pushed with status ${card.alert.status}, label ${card.label}` : "not pushed within 15 s");

  const completed = await until("the alert to reach completed", 90_000, () => {
    const last = pushes[pushes.length - 1];
    const item = last?.ok ? last.items.find((i) => i.alert.id === alertId) : undefined;
    return item?.alert.status === "completed" ? item : null;
  }).catch(() => null);
  const statuses = [...new Set(pushes.flatMap((r) => (r.ok ? r.items.filter((i) => i.alert.id === alertId).map((i) => i.alert.status) : [])))];
  record("live query pushes status changes", completed !== null, `statuses seen live: ${statuses.join(" → ")}`);

  const http = new ConvexHttpClient(CONVEX);

  // 4. Evidence page query
  const ev = (await http.query(anyApi.board!.callEvidence!, { token, callId })) as { ok: boolean; error?: string; evidence?: { level: string; signs: unknown[] } };
  const evText = JSON.stringify(ev);
  const evLeaks = LEAKS.filter((l) => evText.includes(l));
  record("evidence page: quoted evidence, no private data", ev.ok && (ev.evidence?.signs.length ?? 0) > 0 && evLeaks.length === 0, ev.ok ? `level ${ev.evidence?.level}, ${ev.evidence?.signs.length} signs, leaks: ${evLeaks.join(",") || "none"}` : String(ev.error));

  // 5. History export: walk the pages, compare with the board, check for leaks
  // The window is fixed once: Convex rejects a cursor when the query arguments change between pages.
  const untilMs = Date.now() + 1;
  let cursor: string | null = null;
  const rows: { alertId: string }[] = [];
  let pages = 0;
  for (;;) {
    const p = (await http.query(anyApi.board!.alertHistory!, { token, sinceMs, untilMs, paginationOpts: { numItems: 5, cursor } })) as
      | { ok: true; rows: { alertId: string }[]; isDone: boolean; continueCursor: string }
      | { ok: false; error: string };
    if (!p.ok) throw new Error(`history: ${p.error}`);
    pages++;
    rows.push(...p.rows);
    if (p.isDone || pages > 50) break;
    cursor = p.continueCursor;
  }
  const boardNow = pushes[pushes.length - 1];
  const boardCount = boardNow?.ok ? boardNow.items.length : -1;
  const histLeaks = LEAKS.filter((l) => JSON.stringify(rows).includes(l));
  record(
    "history export: all board alerts, paginated, no private data",
    rows.length === boardCount && rows.some((r) => r.alertId === alertId) && histLeaks.length === 0,
    `${rows.length} rows over ${pages} pages (board shows ${boardCount}), leaks: ${histLeaks.join(",") || "none"}`,
  );

  // 6. Briefing audio in Convex file storage
  const url = await until("the briefing to be stored", 30_000, async () => (await http.query(anyApi.audio!.briefingAudioUrl!, { secret: KEY, alertId })) as string | null).catch(() => null);
  let bytes = 0;
  if (url) bytes = (await (await fetch(url)).arrayBuffer()).byteLength;
  const served = await fetch(`${GATEWAY}/api/alerts/${alertId}/audio`, { headers: { "x-internal-key": KEY } });
  record("briefing audio stored in Convex", url !== null && bytes > 0 && served.status === 200, `stored ${bytes} bytes; gateway serves the briefing: HTTP ${served.status}`);

  // 7. Rate limit: 4 outbound calls to one number within 10 minutes → the 4th is refused
  const codes: string[] = [];
  for (let i = 0; i < 4; i++) {
    const r = await gw("POST", "/api/alerts/test-briefing", { targetPhone: LIMIT_PHONE });
    codes.push(r.status === 200 ? "200" : `${r.status} ${String((r.json.error as { code?: string } | undefined)?.code)}`);
  }
  record("rate limit refuses the 4th call to one number", codes[3] === "409 rate_limited", codes.join(", "));

  // 8. Wrong token → unauthorized everywhere
  const bad = "0".repeat(64);
  const denied = await Promise.all([
    http.query(anyApi.board!.listAlerts!, { token: bad, sinceMs }),
    http.query(anyApi.board!.callEvidence!, { token: bad, callId }),
    http.query(anyApi.board!.alertHistory!, { token: bad, sinceMs, untilMs: Date.now(), paginationOpts: { numItems: 5, cursor: null } }),
  ]);
  record("wrong token gets unauthorized, not data", denied.every((d) => (d as { ok: boolean; error?: string }).ok === false && (d as { error?: string }).error === "unauthorized"), denied.map((d) => JSON.stringify(d)).join(" | "));

  // 9. (optional) Token expiry: the held subscription is cut off at 600 s with no client action
  if (EXPIRY) {
    console.log("\nwaiting up to 11 minutes for the board token to expire…");
    const t0 = Date.now();
    const cut = await until("the expiry push", 11 * 60_000, () => {
      const last = pushes[pushes.length - 1];
      return last && !last.ok ? last : null;
    }).catch(() => null);
    record("expired token: open subscription is cut off", cut !== null && !cut.ok && cut.error === "unauthorized", cut ? `unauthorized pushed after ${Math.round((Date.now() - t0) / 1000)} s of waiting` : "no expiry push");
  }

  await live.close();
}

main()
  .catch((e: unknown) => record("smoke run", false, e instanceof Error ? e.message : String(e)))
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ` — FAILED: ${failed.map((f) => f.name).join("; ")}` : ""}`);
    process.exit(failed.length === 0 ? 0 : 1);
  });
