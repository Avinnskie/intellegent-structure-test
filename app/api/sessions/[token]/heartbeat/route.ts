import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { heartbeatSession } from "@/lib/server/participant-session.ts";

export const POST = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/sessions/[token]/heartbeat">) => {
    const { token } = await ctx.params;
    return Response.json(await heartbeatSession(getDb(), token));
  },
);
