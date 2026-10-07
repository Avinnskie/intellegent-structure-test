import { z } from "zod";
import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { submittedSubtestResponsesSchema } from "@/lib/domain/submitted-responses.ts";
import { completeSubtest } from "@/lib/server/participant-complete.ts";

const bodySchema = z.object({
  responses: submittedSubtestResponsesSchema,
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
  async (
    request: Request,
    ctx: RouteContext<"/api/sessions/[token]/subtests/[code]/complete">,
  ) => {
    const { token, code } = await ctx.params;
    const body = bodySchema.parse(await parseBody(request));
    return Response.json(await completeSubtest(getDb(), token, code, body.responses));
  },
);
