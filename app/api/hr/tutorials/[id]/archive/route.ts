import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { archiveTutorial } from "@/lib/server/content.ts";

/**
 * Archives a version. Archiving the published one without a replacement makes session creation
 * fail closed (MASTER_DATA_MISSING) until a new version is published — deliberate (spec §10).
 */
export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/tutorials/[id]/archive">) => {
    assertSameOrigin(request);
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await archiveTutorial(getDb(), auth, id));
  },
);
