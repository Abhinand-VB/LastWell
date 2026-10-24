// X-03 smoke: the console and the board render a replayed A01 under `pnpm dev:fake`.
// A route whose task has not landed yet is skipped with "PENDING: …" (visible in the report);
// E2E_STRICT=1 turns that into a failure (X-05 release run).
import { expect, test, type APIRequestContext } from "@playwright/test";
import { GATEWAY_PORT } from "./ports.js";

const GATEWAY = `http://127.0.0.1:${GATEWAY_PORT}`;
const KEY = "dev-fake-internal-key";
const ALLOWED = "+14155550100";
const STRICT = process.env.E2E_STRICT === "1";
const SHOTS = "test-results/screens";

function pending(cond: boolean, why: string): void {
  if (!cond) return;
  if (STRICT) throw new Error(`PENDING in strict mode: ${why}`);
  test.skip(true, `PENDING: ${why}`);
}

async function replay(request: APIRequestContext, scriptId: string, speed: number): Promise<string | null> {
  const res = await request.post(`${GATEWAY}/api/calls/replay`, { headers: { "x-internal-key": KEY }, data: { scriptId, speed } });
  if (res.status() === 404) return null;
  expect(res.ok(), `replay ${scriptId} → ${res.status()}`).toBeTruthy();
  return ((await res.json()) as { callId: string }).callId;
}

// Approve only once the replay has ended, so the alert's snapshot holds the LKW time and Eliquis.
async function waitEnded(request: APIRequestContext, id: string): Promise<void> {
  await expect
    .poll(async () => {
      const res = await request.get(`${GATEWAY}/api/calls/${id}`, { headers: { "x-internal-key": KEY } });
      return res.ok() ? ((await res.json()) as { call: { status: string } }).call.status : `http ${res.status()}`;
    }, { timeout: 90_000, intervals: [1000] })
    .toBe("ended");
}

test.describe.configure({ mode: "serial" });

let callId: string | null = null;

test("home lists calls", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await page.screenshot({ path: `${SHOTS}/home.png`, fullPage: true });
});

test("console renders the A01 replay: transcript, Likely, quoted chips", async ({ page, request }) => {
  callId = await replay(request, "A01", 4);
  pending(callId === null, "POST /api/calls/replay → 404 (V-11 not landed)");
  const res = await page.goto(`/console/${callId}`);
  pending(res?.status() === 404, "/console/[callId] → 404 (W-02/W-03 not landed)");

  await expect(page.getByText("coffee cup").first()).toBeVisible();
  await expect(page.getByText(/^likely$/i).first()).toBeVisible({ timeout: 60_000 });
  // Quote or drop: the stroke card shows the caller's words next to the chips.
  await expect(page.getByText(/words come out all mixed up|can.t lift his coffee cup/i).nth(1)).toBeVisible();
  await expect(page.getByText("not a stroke", { exact: false })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/console-A01.png`, fullPage: true });
});

test("board shows the approved A01 alert", async ({ page, request }) => {
  pending(callId === null, "no A01 replay call (V-11 not landed)");
  await waitEnded(request, callId!);
  const alert = await request.post(`${GATEWAY}/api/calls/${callId}/alert`, {
    headers: { "x-internal-key": KEY },
    data: { targetPhone: ALLOWED, confirm: true },
  });
  pending(alert.status() === 404, "POST /api/calls/:id/alert → 404 (V-06 not landed)");
  expect(alert.ok(), `approve → ${alert.status()}`).toBeTruthy();

  const res = await page.goto("/board");
  pending(res?.status() === 404, "/board → 404 (W-06 not landed)");
  await expect(page.getByText("The treating team makes every treatment decision.").first()).toBeVisible();
  await expect(page.getByText(/Eliquis/).first()).toBeVisible();
  await expect(page.getByText(/dispatcher pre-alert/i).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/board-A01.png`, fullPage: true });
});

test("console starts empty with the no-signs headline (docs/03 §3)", async ({ page, request }) => {
  const id = await replay(request, "D04", 1);
  pending(id === null, "POST /api/calls/replay → 404 (V-11 not landed)");
  const res = await page.goto(`/console/${id}`);
  pending(res?.status() === 404, "/console/[callId] → 404 (W-03 not landed)");
  await expect(page.getByText("No stroke signs heard yet.")).toBeVisible();
});
