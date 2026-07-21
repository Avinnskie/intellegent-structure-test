import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { createTutorialDraft, listTutorials } from "@/lib/server/content.ts";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

/** Tutorial versions per subtest of the published form (spec §18). */
export const GET = withApiHandler(async () => {
  await requireHrUser(getDb());
  return Response.json({ subtests: await listTutorials(getDb()) });
});

/** Creates a new DRAFT version — published tutorials are immutable (spec §10A). */
export const POST = withApiHandler(async (request: Request) => {
  assertSameOrigin(request);
  const ctx = await requireHrUser(getDb());
  const body = await parseBody(request);
  return Response.json(await createTutorialDraft(getDb(), ctx, body), { status: 201 });
});
