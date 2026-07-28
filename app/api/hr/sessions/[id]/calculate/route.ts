import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { calculateResult } from "@/lib/server/calculate.ts";
import { latestResultId, overrideFinalResult } from "@/lib/server/results.ts";

async function parseBody(request: Request): Promise<{ overrideReason?: string }> {
  const raw = await request.text();
  if (raw.trim() === "") {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as { overrideReason?: unknown };
    return typeof parsed.overrideReason === "string"
      ? { overrideReason: parsed.overrideReason }
      : {};
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Data yang dikirim tidak valid.", 422);
  }
}

export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/sessions/[id]/calculate">) => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const body = await parseBody(request);

    if (body.overrideReason !== undefined) {
      const resultId = await latestResultId(getDb(), auth, id);
      if (resultId) {
        return Response.json(
          await overrideFinalResult(getDb(), auth, resultId, {
            overrideReason: body.overrideReason,
          }),
        );
      }
    }

    return Response.json(await calculateResult(getDb(), auth, id));
  },
);
