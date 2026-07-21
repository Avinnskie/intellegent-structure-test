import { z } from "zod";
import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { clientKeyFrom } from "@/lib/server/client-key.ts";
import { validateAccessCode } from "@/lib/server/participant-access.ts";

// Bounds only. The code's shape is not re-specified here: a stricter pattern would turn a mistyped
// character into a different error than a wrong one, and the hash lookup rejects both identically.
const bodySchema = z.object({ code: z.string().min(4).max(32) });

const INVALID_BODY_MESSAGE = "Data yang dikirim tidak valid.";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    // A malformed body is a client mistake, not a server fault; without this it would surface as an
    // unhandled SyntaxError and a 500.
    throw new ApiError("VALIDATION_ERROR", INVALID_BODY_MESSAGE, 422);
  }
}

export const POST = withApiHandler(async (request: Request) => {
  const body = bodySchema.parse(await parseBody(request));
  const result = await validateAccessCode(getDb(), {
    code: body.code,
    clientKey: clientKeyFrom(request),
  });

  return Response.json(result);
});
