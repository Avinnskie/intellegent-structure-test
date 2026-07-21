import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { getSessionState } from "@/lib/server/participant-session.ts";

/**
 * The participant client's read model. The token lives in the path rather than in a body, because
 * this is a GET the client polls on reconnect and after every navigation.
 *
 * No body to validate: the only input is the token, and its shape is not re-specified here — the
 * hash lookup in `resolveParticipantSession` rejects a malformed token and an unknown one
 * identically, which is what keeps this from becoming an oracle.
 */
export const GET = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/sessions/[token]/state">) => {
    // Next 16: `ctx.params` is a Promise.
    const { token } = await ctx.params;
    return Response.json(await getSessionState(getDb(), token));
  },
);
