// The /api/gateway/[...path] proxy (docs/01 §7): forwards to `${GATEWAY_URL}/api/<path>` and adds
// x-internal-key so the key never reaches the browser. Pure apart from the injected fetch.

export interface ProxyConfig {
  gatewayUrl: string;
  internalKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function gatewayTarget(gatewayUrl: string, path: string[], search: string): string | null {
  if (path.length === 0 || !path.every((s) => PATH_SEGMENT.test(s) && s !== "." && s !== "..")) return null;
  return `${gatewayUrl}/api/${path.join("/")}${search}`;
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function proxyToGateway(req: Request, path: string[], cfg: ProxyConfig): Promise<Response> {
  const url = new URL(req.url);
  const target = gatewayTarget(cfg.gatewayUrl, path, url.search);
  if (!target) return errorResponse(400, "bad_path", "invalid gateway path");

  const headers: Record<string, string> = { "x-internal-key": cfg.internalKey };
  const contentType = req.headers.get("content-type");
  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.text();
    if (body.length > 0) headers["content-type"] = contentType ?? "application/json";
  }

  const fetchImpl = cfg.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(target, {
      method: req.method,
      headers,
      body: body && body.length > 0 ? body : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 15_000),
    });
    // Bytes, not text: GET alerts/:id/audio is a WAV (D-43).
    const bytes = await res.arrayBuffer();
    return new Response(bytes, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return errorResponse(502, "gateway_unreachable", `gateway unreachable: ${reason}`);
  }
}
