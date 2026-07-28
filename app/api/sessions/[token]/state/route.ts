import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { getSessionState } from "@/lib/server/participant-session.ts";

export const GET = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/sessions/[token]/state">) => {
    const { token } = await ctx.params;
    return Response.json(await getSessionState(getDb(), token));
  },
);
