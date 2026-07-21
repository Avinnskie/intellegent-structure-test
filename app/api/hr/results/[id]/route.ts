import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { getResult } from "@/lib/server/calculate.ts";

/**
 * The result read model (spec §16). `[id]` is the SESSION id per the API contract §18; the service
 * resolves the latest live result. Requires `view_results` — role alone is not enough (§4.3).
 */
export const GET = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/hr/results/[id]">) => {
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await getResult(getDb(), auth, id));
  },
);
