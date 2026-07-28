import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { getItemAnswerKey } from "@/lib/server/content.ts";

export const GET = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/hr/question-bank/items/[id]/answer-key">) => {
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await getItemAnswerKey(getDb(), auth, id), {
      headers: { "cache-control": "no-store" },
    });
  },
);
