import { z } from "zod";
import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { responseDriftFields, saveResponse } from "@/lib/server/participant-responses.ts";
import { logInfo } from "@/lib/server/logger.ts";

/**
 * Bounds only — the value's MEANING is not re-specified here.
 *
 * Whether a string is a legal answer depends on the item that receives it (a choice item takes only
 * its own `option_code`), which needs the database. Duplicating a weaker version of that rule in the
 * route would make the endpoint's answer depend on which of the two checks ran first.
 *
 * `clientTimestamp` is accepted, never trusted: the server has its own clock, and this exists purely
 * so a support ticket can say how far the participant's device had drifted.
 */
const bodySchema = z.object({
  value: z.string().max(500),
  clientTimestamp: z.string().max(64).optional(),
});

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

/**
 * Autosave. PUT because it is idempotent by contract: the client re-sends on every debounce tick and
 * after every reconnect, and the same value twice must leave the record — and `updated_at` — exactly
 * as the first one did.
 *
 * `clientTimestamp` reaches `responseDriftFields` and NOTHING else. It is not passed to
 * `saveResponse`, whose signature has nowhere to put it, and the drift line is emitted AFTER the
 * save from the DTO's own `savedAt` — so it is structurally incapable of influencing the decision.
 */
export const PUT = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/sessions/[token]/responses/[itemId]">) => {
    // Next 16: `ctx.params` is a Promise.
    const { token, itemId } = await ctx.params;
    const body = bodySchema.parse(await parseBody(request));

    const dto = await saveResponse(getDb(), token, itemId, body.value);

    const drift = responseDriftFields(body.clientTimestamp, dto.savedAt);
    if (drift) {
      // Only a meaningfully skewed clock is logged, and only as scalars. Never the token, never the
      // value (spec §19) — the item id is omitted too, since it is not needed to diagnose a clock.
      logInfo("participant_clock_drift", drift);
    }

    return Response.json(dto);
  },
);
