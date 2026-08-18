import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { beginOrResumeMemorization } from "@/lib/server/memorization-session.ts";

export const POST = withApiHandler(
  async (_request: Request, ctx: { params: Promise<{ token: string }> }) => {
    const { token } = await ctx.params;
    return Response.json(await beginOrResumeMemorization(getDb(), token));
  },
);
