import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { startSubtest } from "@/lib/server/participant-start.ts";

export const POST = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/sessions/[token]/subtests/[code]/start">) => {
    const { token, code } = await ctx.params;
    return Response.json(await startSubtest(getDb(), token, code));
  },
);
