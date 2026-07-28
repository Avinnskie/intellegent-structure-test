import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { createSupabaseAuthAdminProvider } from "@/lib/providers/auth-admin.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { updatePortalUser } from "@/lib/server/users.ts";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

export const PUT = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/admin/users/[id]">) => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const body = await parseBody(request);
    return Response.json(
      await updatePortalUser(getDb(), createSupabaseAuthAdminProvider(), auth, id, body),
      { headers: { "cache-control": "no-store" } },
    );
  },
);
