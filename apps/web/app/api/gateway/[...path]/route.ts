import { serverEnv } from "@/lib/env";
import { proxyToGateway } from "@/lib/proxy";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params;
  const env = serverEnv();
  return proxyToGateway(req, path, { gatewayUrl: env.GATEWAY_URL, internalKey: env.INTERNAL_API_KEY });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
