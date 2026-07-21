import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { createSupabaseAuthAdminProvider } from "@/lib/providers/auth-admin.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { createPortalUser, listPortalUsers } from "@/lib/server/users.ts";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

/** Super_admin only (enforced in the service). The password is write-only pass-through. */
export const GET = withApiHandler(async () => {
  const ctx = await requireHrUser(getDb());
  return Response.json({ users: await listPortalUsers(getDb(), ctx) });
});

export const POST = withApiHandler(async (request: Request) => {
  assertSameOrigin(request);
  const ctx = await requireHrUser(getDb());
  const body = await parseBody(request);
  return Response.json(
    await createPortalUser(getDb(), createSupabaseAuthAdminProvider(), ctx, body),
    { status: 201, headers: { "cache-control": "no-store" } },
  );
});
