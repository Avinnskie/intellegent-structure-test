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

/**
 * Retires the old code (`regenerated`, kept as linked history) and mints a fresh one. The response
 * carries the new PLAINTEXT code — the only time it exists outside the hash — so no-store.
 */
export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/sessions/[id]/access-code/regenerate">) => {
    assertSameOrigin(request);
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const body = await parseBody(request);
    return Response.json(await regenerateAccessCode(getDb(), auth, id, body), {
      headers: { "cache-control": "no-store" },
    });
  },
);
