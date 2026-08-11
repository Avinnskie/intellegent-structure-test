import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { startPapi } from "@/lib/server/papi-participant.ts";

export const POST = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/sessions/[token]/papi/start">) => {
    const { token } = await ctx.params;
    return Response.json(await startPapi(getDb(), token));
  },
);
