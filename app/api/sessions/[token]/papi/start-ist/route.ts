import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { startIstAfterPapi } from "@/lib/server/papi-participant.ts";

export const POST = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/sessions/[token]/papi/start-ist">) => {
    const { token } = await ctx.params;
    await startIstAfterPapi(getDb(), token);
    return Response.json({ ok: true });
  },
);
