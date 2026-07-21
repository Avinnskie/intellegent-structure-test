import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { publishTutorial } from "@/lib/server/content.ts";

/** Publishes a draft; the previous published version of the subtest is archived atomically. */
export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/tutorials/[id]/publish">) => {
    assertSameOrigin(request);
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await publishTutorial(getDb(), auth, id));
  },
);
