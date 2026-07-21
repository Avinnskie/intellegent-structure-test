import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { getUnanswered } from "@/lib/server/participant-responses.ts";

/**
 * The "Belum Dijawab" list (spec §8): the items the participant still has to deal with.
 *
 * No body to validate, and neither path segment is re-specified here: the token is checked by the
 * hash lookup inside `getUnanswered`, which rejects a malformed and an unknown one identically, and
 * an unknown subtest code is answered the same way as a real-but-wrong one so that neither becomes
 * an oracle — the same rule T13's start route follows.
 *
 * A GET, and safe: it carries no answer values, only navigation targets.
 */
export const GET = withApiHandler(
  async (
    _request: Request,
    ctx: RouteContext<"/api/sessions/[token]/subtests/[code]/unanswered">,
  ) => {
    // Next 16: `ctx.params` is a Promise.
    const { token, code } = await ctx.params;
    return Response.json(await getUnanswered(getDb(), token, code));
  },
);
