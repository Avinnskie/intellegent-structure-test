import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { finishTest } from "@/lib/server/participant-complete.ts";

export const POST = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/sessions/[token]/finish">) => {
    const { token } = await ctx.params;
    return Response.json(await finishTest(getDb(), token));
  },
);
