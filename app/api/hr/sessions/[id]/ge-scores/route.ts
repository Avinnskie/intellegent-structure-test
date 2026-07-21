import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { listGeItems, saveGeScores } from "@/lib/server/ge-scoring.ts";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

/** The GE scoring board's data: 16 items, verbatim answers, rubric, existing scores. */
export const GET = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/hr/sessions/[id]/ge-scores">) => {
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await listGeItems(getDb(), auth, id));
  },
);

/** Save/override GE scores (spec §18 PUT). Overrides require a reason and are audited. */
export const PUT = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/sessions/[id]/ge-scores">) => {
    assertSameOrigin(request);
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const body = await parseBody(request);
    return Response.json(await saveGeScores(getDb(), auth, id, body));
  },
);
