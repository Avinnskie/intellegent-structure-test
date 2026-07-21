import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { deleteCandidate, updateCandidate } from "@/lib/server/hr.ts";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

/** Full-field edit of one candidate (org-scoped, audited by id only). */
export const PUT = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/candidates/[id]">) => {
    assertSameOrigin(request);
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const body = await parseBody(request);
    return Response.json(await updateCandidate(getDb(), auth, id, body));
  },
);

/** Deletes a candidate WITHOUT sessions; refused with 409 otherwise (history never vanishes). */
export const DELETE = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/candidates/[id]">) => {
    assertSameOrigin(request);
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await deleteCandidate(getDb(), auth, id));
  },
);
