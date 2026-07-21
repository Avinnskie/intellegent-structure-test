import { z } from "zod";
import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { responseDriftFields, skipResponse } from "@/lib/server/participant-responses.ts";
import { logInfo } from "@/lib/server/logger.ts";

/**
 * No `value`: a skip is the ABSENCE of one, and the service writes `response_value` null. Accepting
 * a value here and ignoring it would invite a client to "skip with an answer".
 */
const bodySchema = z.object({ clientTimestamp: z.string().max(64).optional() });

const INVALID_BODY_MESSAGE = "Data yang dikirim tidak valid.";

/**
 * The body is OPTIONAL here, unlike the save endpoint: its only field is diagnostic, so a client
 * that sends nothing is making a complete request, and `request.json()` throws on an empty body.
 * A present-but-malformed body is still a 422 — silence is a valid request, garbage is not.
 */
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

/**
 * "Lewati" (spec §8). POST rather than PUT because it targets a sub-resource, and idempotent all the
 * same: a double-tapped button is the same request twice and writes once.
 */
export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/sessions/[token]/responses/[itemId]/skip">) => {
    // Next 16: `ctx.params` is a Promise.
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
