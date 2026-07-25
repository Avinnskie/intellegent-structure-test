import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { getResult } from "@/lib/server/calculate.ts";

export const GET = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/hr/results/[id]">) => {
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await getResult(getDb(), auth, id));
  },
);
