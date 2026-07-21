import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { deleteSession, getSessionDetail } from "@/lib/server/hr.ts";

/**
 * One session, org-scoped. A session belonging to another organization — or a malformed id, or an
 * unknown one — is the same `NOT_FOUND`, so the endpoint confirms nothing it will not show.
 */
export const GET = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/hr/sessions/[id]">) => {
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await getSessionDetail(getDb(), auth, id));
  },
);

/** Deletes a session ONLY before anything was sat (code_generated/code_validated); 409 otherwise. */
export const DELETE = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/sessions/[id]">) => {
    assertSameOrigin(request);
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await deleteSession(getDb(), auth, id));
  },
);
