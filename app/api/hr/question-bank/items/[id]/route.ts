import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { updateQuestionItem } from "@/lib/server/content.ts";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

/**
 * In-place content edit of one item (prompt, placeholder, option LABELS — never option codes,
 * which the scoring key and recorded responses address). Visible to running sessions by design.
 */
export const PUT = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/question-bank/items/[id]">) => {
    assertSameOrigin(request);
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const body = await parseBody(request);
    return Response.json(await updateQuestionItem(getDb(), auth, id, body));
  },
);
