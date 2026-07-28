import { z } from "zod";
import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { responseDriftFields, skipResponse } from "@/lib/server/participant-responses.ts";
import { logInfo } from "@/lib/server/logger.ts";

const bodySchema = z.object({ clientTimestamp: z.string().max(64).optional() });

const INVALID_BODY_MESSAGE = "Data yang dikirim tidak valid.";

async function parseBody(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (raw.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError("VALIDATION_ERROR", INVALID_BODY_MESSAGE, 422);
  }
}

export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/sessions/[token]/responses/[itemId]/skip">) => {
    const { token, itemId } = await ctx.params;
    const body = bodySchema.parse(await parseBody(request));

    const dto = await skipResponse(getDb(), token, itemId);

    const drift = responseDriftFields(body.clientTimestamp, dto.savedAt);
    if (drift) {
      logInfo("participant_clock_drift", drift);
    }

    return Response.json(dto);
  },
);
