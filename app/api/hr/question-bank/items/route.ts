import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { createQuestionItem } from "@/lib/server/content.ts";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

/** Adds a new item to the currently published form and key, following question-bank edit semantics. */
export const POST = withApiHandler(async (request: Request) => {
  assertSameOrigin(request);
  const auth = await requireHrUser(getDb());
  const body = await parseBody(request);
  return Response.json(await createQuestionItem(getDb(), auth, body), { status: 201 });
});
