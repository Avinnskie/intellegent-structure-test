"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/providers/supabase-server";
import { writeAudit } from "@/lib/server/audit";
import { resolveHrUser } from "@/lib/server/authz";
import { safeNextPath } from "@/lib/server/safe-redirect";
import { logError, logInfo } from "@/lib/server/logger";

export type LoginState = { readonly message: string | null };

const INVALID_CREDENTIALS_MESSAGE = "Email atau kata sandi salah.";
const INVALID_INPUT_MESSAGE = "Email dan kata sandi wajib diisi.";
const UNEXPECTED_MESSAGE = "Terjadi kesalahan saat masuk. Coba lagi.";

const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { message: INVALID_INPUT_MESSAGE };
  }

  const destination = safeNextPath(formData.get("next")?.toString());
  const db = getDb();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    await writeAudit(db, {
      actorType: "user",
      action: "auth.login_failed",
      objectType: "user",
      metadata: { reason: "invalid_credentials" },
    });
    logInfo("auth_login_failed", { reason: "invalid_credentials" });
    return { message: INVALID_CREDENTIALS_MESSAGE };
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
      return { message: caught.message };
    }
    return { message: UNEXPECTED_MESSAGE };
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, context.userId))
    .catch((error: unknown) => {
      logError("auth_login_touch_failed", { userId: context.userId }, error);
    });
  await writeAudit(db, {
    organizationId: context.organizationId,
    actorType: "user",
    actorId: context.userId,
    action: "auth.login",
    objectType: "user",
    objectId: context.userId,
    metadata: { role: context.role },
  }).catch((error: unknown) => {
    logError("auth_login_audit_failed", { userId: context.userId }, error);
  });
  logInfo("auth_login", { userId: context.userId, role: context.role });

  redirect(destination);
}

export async function signOut(): Promise<void> {
  const db = getDb();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    const userId = data.user.id;
    const context = await resolveHrUser(db, userId).catch(() => null);
    await writeAudit(db, {
      organizationId: context?.organizationId ?? null,
      actorType: "user",
      actorId: userId,
      action: "auth.logout",
      objectType: "user",
      objectId: userId,
    }).catch((error: unknown) => {
      logError("auth_logout_audit_failed", { userId }, error);
    });
    logInfo("auth_logout", { userId });
  }

  await supabase.auth.signOut();
  redirect("/login");
}
