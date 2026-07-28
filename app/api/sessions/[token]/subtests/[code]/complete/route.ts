import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { completeSubtest } from "@/lib/server/participant-complete.ts";

export const POST = withApiHandler(
  async (
    _request: Request,
    ctx: RouteContext<"/api/sessions/[token]/subtests/[code]/complete">,
  ) => {
    const { token, code } = await ctx.params;
    return Response.json(await completeSubtest(getDb(), token, code));
  },
);
