import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { finalizeResult } from "@/lib/server/results.ts";

/**
 * Locks a result as `final` (spec §13: only final results are exportable). `[id]` is the RESULT
 * id. Irreversible except through the audited override on the calculate endpoint.
 */
export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/results/[id]/finalize">) => {
    assertSameOrigin(request);
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await finalizeResult(getDb(), auth, id));
  },
);
