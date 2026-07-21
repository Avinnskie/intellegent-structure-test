import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { heartbeatSession } from "@/lib/server/participant-session.ts";

/**
 * Keepalive for a running timer: reports the server clock and runs the same timeout sweep as
 * `GET /state`, so a tab left open past `expires_at` is closed by the server rather than by the
 * client noticing.
 *
 * POST rather than GET because it writes — the sweep closes attempts and advances the session.
 * The body is ignored: a client clock would be the only thing to put in it, and this endpoint
 * exists precisely because the client's clock is not trusted.
 */
export const POST = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/sessions/[token]/heartbeat">) => {
    // Next 16: `ctx.params` is a Promise.
    const { token } = await ctx.params;
    return Response.json(await heartbeatSession(getDb(), token));
  },
);
