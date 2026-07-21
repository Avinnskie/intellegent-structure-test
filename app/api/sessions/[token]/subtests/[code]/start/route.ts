import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { startSubtest } from "@/lib/server/participant-start.ts";

/**
 * "Mulai Subtes": the request that creates the timer.
 *
 * POST because it writes, and idempotent because spec §11 requires it to be — a second press, a
 * refresh, or a second tab resumes the running attempt rather than restarting its clock.
 *
 * No body to validate. The two inputs are both path segments, and neither is re-specified here: the
 * token is checked by the hash lookup inside `startSubtest`, which rejects a malformed and an
 * unknown one identically, and an unknown subtest code is answered the same way as a wrong one, so
 * that neither path becomes an oracle. Any time the client might put in a body would be its own
 * clock, which is exactly what this endpoint exists to not trust.
 */
export const POST = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/sessions/[token]/subtests/[code]/start">) => {
    // Next 16: `ctx.params` is a Promise.
    const { token, code } = await ctx.params;
    return Response.json(await startSubtest(getDb(), token, code));
  },
);
