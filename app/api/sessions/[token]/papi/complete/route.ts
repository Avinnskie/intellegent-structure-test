import { z } from "zod";
import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { submittedPapiAnswersSchema } from "@/lib/domain/submitted-responses.ts";
import { completePapi } from "@/lib/server/papi-participant.ts";

const bodySchema = z.object({
  answers: submittedPapiAnswersSchema,
});

const INVALID_BODY_MESSAGE = "Data jawaban yang dikirim tidak valid.";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiError("VALIDATION_ERROR", INVALID_BODY_MESSAGE, 422);
    }
    throw error;
  }
}

export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/sessions/[token]/papi/complete">) => {
    const { token } = await ctx.params;
    const body = bodySchema.parse(await parseBody(request));
    return Response.json(await completePapi(getDb(), token, body.answers));
  },
);
