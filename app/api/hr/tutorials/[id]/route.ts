import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { updateTutorialDraft } from "@/lib/server/content.ts";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

/** Edits a DRAFT's content. Published versions refuse — they may be pinned by sessions. */
export const PUT = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/tutorials/[id]">) => {
    assertSameOrigin(request);
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const body = await parseBody(request);
    return Response.json(await updateTutorialDraft(getDb(), auth, id, body));
  },
);
