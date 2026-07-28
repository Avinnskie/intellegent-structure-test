import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { regenerateAccessCode } from "@/lib/server/hr.ts";

async function parseBody(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (raw.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/sessions/[id]/access-code/regenerate">) => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const body = await parseBody(request);
    return Response.json(await regenerateAccessCode(getDb(), auth, id, body), {
      headers: { "cache-control": "no-store" },
    });
  },
);
