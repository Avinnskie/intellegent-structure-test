import { z } from "zod";
import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { clientKeyFrom } from "@/lib/server/client-key.ts";
import { validateAccessCode } from "@/lib/server/participant-access.ts";

const bodySchema = z.object({ code: z.string().min(4).max(32) });

const INVALID_BODY_MESSAGE = "Data yang dikirim tidak valid.";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
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
