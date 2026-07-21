import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { createSession, listSessions } from "@/lib/server/hr.ts";

const INVALID_BODY_MESSAGE = "Data yang dikirim tidak valid.";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", INVALID_BODY_MESSAGE, 422);
  }
}

/**
 * Creating a session mints its access code. The response carries the PLAINTEXT code — the only
 * time it ever leaves the server — so this handler must never be cached and never logged whole.
 */
export const POST = withApiHandler(async (request: Request) => {
  assertSameOrigin(request);
  const ctx = await requireHrUser(getDb());
  const body = await parseBody(request);
  return Response.json(await createSession(getDb(), ctx, body), {
    status: 201,
    headers: { "cache-control": "no-store" },
  });
});

export const GET = withApiHandler(async (request: Request) => {
  const ctx = await requireHrUser(getDb());
  const url = new URL(request.url);
  const sessions = await listSessions(getDb(), ctx, {
    status: url.searchParams.get("status") ?? undefined,
    query: url.searchParams.get("query") ?? undefined,
  });
  return Response.json({ sessions });
});
