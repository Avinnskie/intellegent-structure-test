import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { completeSubtest } from "@/lib/server/participant-complete.ts";

/**
 * "Selesaikan subtes": the request that hands a subtest in and shuts its write gate.
 *
 * POST because it writes, and NOT idempotent in the way the start endpoint is: a second press is a
 * `SUBTEST_LOCKED` 409, because spec §10 says the participant cannot return to a subtest that is
 * already closed, and silently reporting success would tell them a fresh close happened.
 *
 * No body to validate. The two inputs are both path segments, and neither is re-specified here: the
 * token is checked by the hash lookup inside `completeSubtest`, which rejects a malformed and an
 * unknown one identically, and an unknown subtest code is answered the same way as a wrong one, so
 * that neither path becomes an oracle. The only thing a client could put in a body is its own clock,
 * which is exactly what this endpoint refuses to trust: whether the close is `manual` or `timeout`
 * is decided against the DATABASE's `now()`.
 */
export const POST = withApiHandler(
  async (
    _request: Request,
    ctx: RouteContext<"/api/sessions/[token]/subtests/[code]/complete">,
  ) => {
    // Next 16: `ctx.params` is a Promise.
    const { token, code } = await ctx.params;
    return Response.json(await completeSubtest(getDb(), token, code));
  },
);
