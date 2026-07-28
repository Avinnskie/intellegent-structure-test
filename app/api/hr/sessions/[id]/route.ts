import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { deleteSession, getSessionDetail } from "@/lib/server/hr.ts";

export const GET = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/hr/sessions/[id]">) => {
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await getSessionDetail(getDb(), auth, id));
  },
);

export const DELETE = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/sessions/[id]">) => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await deleteSession(getDb(), auth, id));
  },
);
