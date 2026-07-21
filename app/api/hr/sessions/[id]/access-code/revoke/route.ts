import { z } from "zod";
import { ApiError, withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { assertSameOrigin, requireHrUser } from "@/lib/server/authz.ts";
import { revokeAccessCode } from "@/lib/server/hr.ts";

/** Reason is optional and audit-only; bounded so the audit row cannot be stuffed. */
const bodySchema = z.object({ reason: z.string().trim().min(1).max(500).optional() });

async function parseBody(request: Request): Promise<{ reason?: string }> {
  const raw = await request.text();
  if (raw.trim() === "") {
    return {};
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

/**
 * Kills the entry code AND every live participant token — a revocation that leaves the participant
 * typing would not be one. Irreversible by design; re-admission goes through regenerate.
 */
export const POST = withApiHandler(
  async (request: Request, ctx: RouteContext<"/api/hr/sessions/[id]/access-code/revoke">) => {
    assertSameOrigin(request);
    // Next 16: `ctx.params` is a Promise.
    const { id } = await ctx.params;
    const auth = await requireHrUser(getDb());
    const body = await parseBody(request);
    return Response.json(await revokeAccessCode(getDb(), auth, id, body.reason));
  },
);
