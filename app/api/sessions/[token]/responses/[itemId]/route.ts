import { z } from "zod";
import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { responseDriftFields, saveResponse } from "@/lib/server/participant-responses.ts";
import { logInfo } from "@/lib/server/logger.ts";

const bodySchema = z.object({
  value: z.string().max(500),
  clientTimestamp: z.string().max(64).optional(),
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
  async (request: Request, ctx: RouteContext<"/api/sessions/[token]/responses/[itemId]">) => {
    const { token, itemId } = await ctx.params;
    const body = bodySchema.parse(await parseBody(request));

    const dto = await saveResponse(getDb(), token, itemId, body.value);

    const drift = responseDriftFields(body.clientTimestamp, dto.savedAt);
    if (drift) {
      logInfo("participant_clock_drift", drift);
    }

    return Response.json(dto);
  },
);
