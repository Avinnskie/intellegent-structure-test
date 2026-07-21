import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { createCandidate, listCandidates } from "@/lib/server/hr.ts";

const INVALID_BODY_MESSAGE = "Data yang dikirim tidak valid.";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", INVALID_BODY_MESSAGE, 422);
  }
}

/**
 * HR candidate registry. Auth first, CSRF on the mutation, org scoping inside the service — every
 * HR route follows this exact order so none can be reached with less than all three.
 */
export const POST = withApiHandler(async (request: Request) => {
  assertSameOrigin(request);
  const ctx = await requireHrUser(getDb());
  const body = await parseBody(request);
  return Response.json(await createCandidate(getDb(), ctx, body), { status: 201 });
});

export const GET = withApiHandler(async () => {
  const ctx = await requireHrUser(getDb());
  return Response.json({ candidates: await listCandidates(getDb(), ctx) });
});
