import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { updatePapiItem } from "@/lib/server/papi-content.ts";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

export const PUT = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/papi-question-bank/items/[id]">) => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await updatePapiItem(getDb(), auth, id, await parseBody(request)));
  },
);
