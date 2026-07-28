import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { getUnanswered } from "@/lib/server/participant-responses.ts";

export const GET = withApiHandler(
  async (
    _request: Request,
    ctx: RouteContext<"/api/sessions/[token]/subtests/[code]/unanswered">,
  ) => {
    const { token, code } = await ctx.params;
    return Response.json(await getUnanswered(getDb(), token, code));
  },
);
