import { z } from "zod";
import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { savePapiAnswer } from "@/lib/server/papi-participant.ts";

const bodySchema = z.object({
  option: z.enum(["A", "B"]),
});

const INVALID_BODY_MESSAGE = "Data yang dikirim tidak valid.";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", INVALID_BODY_MESSAGE, 422);
  }
}

export const PUT = withApiHandler(
  async (
    request: Request,
    ctx: RouteContext<"/api/sessions/[token]/papi/responses/[itemNumber]">,
  ) => {
    const { token, itemNumber } = await ctx.params;
    const body = bodySchema.parse(await parseBody(request));

    return Response.json(await savePapiAnswer(getDb(), token, Number(itemNumber), body.option));
  },
);
