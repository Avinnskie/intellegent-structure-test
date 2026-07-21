import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { finishTest } from "@/lib/server/participant-complete.ts";

/**
 * "Selesaikan tes": kept for backward compatibility — closing ME already drove the session into
 * its scoring state and ran the auto-calculation, so this endpoint only REPORTS the committed
 * state. It is idempotent by construction (it writes nothing) and never invents a completion:
 * from mid-test states it answers `SESSION_NOT_ACTIVE` 409.
 *
 * No body, and no subtest code: which subtest ended is already on the record. The token is the only
 * input, and it is checked by the hash lookup inside `finishTest`.
 */
export const POST = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/sessions/[token]/finish">) => {
    // Next 16: `ctx.params` is a Promise.
    const { token } = await ctx.params;
    return Response.json(await finishTest(getDb(), token));
  },
);
