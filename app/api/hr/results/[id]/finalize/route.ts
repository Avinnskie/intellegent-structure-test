import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { finalizeResult } from "@/lib/server/results.ts";

export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/results/[id]/finalize">) => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await finalizeResult(getDb(), auth, id));
  },
);
