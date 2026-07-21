import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { getItemAnswerKey } from "@/lib/server/content.ts";

/**
 * The current answer key of ONE item, for the authorized editor only. Kept off the bulk list on
 * purpose — the key travels exactly when an editor opens it, never with the whole bank.
 */
export const GET = withApiHandler(
  async (_request: Request, ctx: RouteContext<"/api/hr/question-bank/items/[id]/answer-key">) => {
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    return Response.json(await getItemAnswerKey(getDb(), auth, id), {
      headers: { "cache-control": "no-store" },
    });
  },
);
