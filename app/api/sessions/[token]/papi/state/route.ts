import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { getPapiState } from "@/lib/server/papi-participant.ts";

export const GET = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/sessions/[token]/papi/state">) => {
    const { token } = await ctx.params;
    return Response.json(await getPapiState(getDb(), token));
  },
);
