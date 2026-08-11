import { z } from "zod";
import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { skipPapi } from "@/lib/server/papi-hr.ts";

const bodySchema = z.object({
  reason: z.enum(["participant_declined", "hr_closed_early"]).default("hr_closed_early"),
});

async function parseBody(request: Request): Promise<z.infer<typeof bodySchema>> {
  const raw = await request.text();
  if (raw.trim() === "") {
    return { reason: "hr_closed_early" };
  }
  try {
    return bodySchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw error;
    }
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/sessions/[id]/papi/skip">) => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const body = await parseBody(request);
    return Response.json(await skipPapi(getDb(), auth, id, body.reason));
  },
);
