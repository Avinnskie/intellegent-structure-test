import { eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, withApiHandler } from "@/lib/api/errors";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/providers/supabase-server";
import { writeAudit } from "@/lib/server/audit";
import { assertSameOrigin, resolveHrUser } from "@/lib/server/authz";
import { logError, logInfo } from "@/lib/server/logger";
import { safeNextPath } from "@/lib/server/safe-redirect";

const INVALID_CREDENTIALS_MESSAGE = "Email atau kata sandi salah.";
const INVALID_INPUT_MESSAGE = "Email dan kata sandi wajib diisi.";
const UNEXPECTED_MESSAGE = "Terjadi kesalahan saat masuk. Coba lagi.";

const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});

function loginError(message: string, status: number): Response {
  return Response.json({ error: { message } }, { status });
}

export const POST = withApiHandler(async (request: Request) => {
  assertSameOrigin(request);

  const formData = await request.formData();
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return loginError(INVALID_INPUT_MESSAGE, 422);
  }

  const destination = safeNextPath(formData.get("next")?.toString());
  const db = getDb();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    await writeAudit(db, {
      actorType: "user",
      action: "auth.login_failed",
      objectType: "user",
      metadata: { reason: "invalid_credentials" },
    });
    logInfo("auth_login_failed", { reason: "invalid_credentials" });
    return loginError(INVALID_CREDENTIALS_MESSAGE, 401);
  }

  const authUserId = data.user.id;
  let context;
  try {
    context = await resolveHrUser(db, authUserId);
  } catch (caught: unknown) {
    await supabase.auth.signOut();

    if (caught instanceof ApiError) {
      await writeAudit(db, {
        actorType: "user",
        actorId: authUserId,
        action: "auth.login_denied",
        objectType: "user",
        objectId: authUserId,
        metadata: { reason: caught.code },
      });
      logInfo("auth_login_denied", { userId: authUserId, code: caught.code });
      return loginError(caught.message, caught.status);
    }

    logError("auth_login_failed", { userId: authUserId }, caught);
    return loginError(UNEXPECTED_MESSAGE, 500);
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, context.userId))
    .catch((caught: unknown) => {
      logError("auth_login_touch_failed", { userId: context.userId }, caught);
    });
  await writeAudit(db, {
    organizationId: context.organizationId,
    actorType: "user",
    actorId: context.userId,
    action: "auth.login",
    objectType: "user",
    objectId: context.userId,
    metadata: { role: context.role },
  }).catch((caught: unknown) => {
    logError("auth_login_audit_failed", { userId: context.userId }, caught);
  });
  logInfo("auth_login", { userId: context.userId, role: context.role });

  return Response.json({ redirectTo: destination });
});
