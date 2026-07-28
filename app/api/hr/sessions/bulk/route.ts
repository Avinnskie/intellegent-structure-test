import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { bulkCreateSessions } from "@/lib/server/hr.ts";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

export const POST = withApiHandler(async (request: Request) => {
  assertSameOrigin(request);
  const ctx = await requireHrUser(getDb());
  const body = await parseBody(request);
  return Response.json(await bulkCreateSessions(getDb(), ctx, body), {
    status: 201,
    headers: { "cache-control": "no-store" },
  });
});
