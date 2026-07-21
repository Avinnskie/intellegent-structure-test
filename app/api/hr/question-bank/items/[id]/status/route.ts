import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { setQuestionItemStatus } from "@/lib/server/content.ts";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

/** Toggles active/inactive. Inactive items keep serving pinned decks (T13) — this is a flag. */
export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/question-bank/items/[id]/status">) => {
    assertSameOrigin(request);
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const body = await parseBody(request);
    return Response.json(await setQuestionItemStatus(getDb(), auth, id, body));
  },
);
