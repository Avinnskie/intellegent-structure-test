import { z } from "zod";
import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { reviewResult } from "@/lib/server/results.ts";

const bodySchema = z.object({ notes: z.string().trim().min(1).max(2000) });

async function parseBody(request: Request): Promise<{ notes: string }> {
  try {
    return bodySchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw error;
    }
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

/** `draft → reviewed` with the reviewer's notes. `[id]` is the RESULT id. */
export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/results/[id]/review">) => {
    assertSameOrigin(request);
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const body = await parseBody(request);
    return Response.json(await reviewResult(getDb(), auth, id, body.notes));
  },
);
