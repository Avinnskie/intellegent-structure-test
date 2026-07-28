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

export const GET = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/hr/sessions/[id]/ge-scores">) => {
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await listGeItems(getDb(), auth, id));
  },
);

export const PUT = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/sessions/[id]/ge-scores">) => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const body = await parseBody(request);
    return Response.json(await saveGeScores(getDb(), auth, id, body));
  },
);
