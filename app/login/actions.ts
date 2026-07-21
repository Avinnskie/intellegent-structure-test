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

/**
 * One message for "no such account" and for "wrong password", deliberately: distinct copy turns the
 * login form into an oracle that tells an attacker which emails are registered.
 */
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
    // Auth events are auditable (§19) — but the email is PII and never reaches the audit row or the
    // log line. A failed attempt has no user id to record, so there is deliberately nothing here
    // that identifies who tried: the row exists to count and time the attempts, not to name them.
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
    // Authenticated is not authorized. Checking provisioning HERE, rather than letting them land on
    // /hr and bounce, is what keeps a valid-but-unprovisioned session from ping-ponging: the layout
    // would send them straight back to this page.
    context = await resolveHrUser(db, authUserId);
  } catch (caught: unknown) {
    // Their session is valid but useless here — drop it rather than leave them holding a cookie
    // that only produces redirects.
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
      // ApiError messages are our own Indonesian copy, so they are safe to show.
      return { message: caught.message };
    }
    return { message: UNEXPECTED_MESSAGE };
  }

  // BEST-EFFORT FROM HERE ON. The session cookie is already set — the user IS logged in. A
  // transient database blip while stamping a timestamp must not throw out of the action and show a
  // crash to someone who just authenticated successfully. Bookkeeping is not worth an availability
  // path, so both of these swallow into the log rather than propagate.
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
    // The audit row is lost, but the log line below still records the login (§19 keeps auth events
    // observable), and the failure itself is now visible at error level.
    logError("auth_login_audit_failed", { userId: context.userId }, error);
  });
  logInfo("auth_login", { userId: context.userId, role: context.role });

  // Outside the try/catch above on purpose: redirect() signals by throwing, and a catch would eat it.
  redirect(destination);
}

export async function signOut(): Promise<void> {
  const db = getDb();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    const userId = data.user.id;
    const context = await resolveHrUser(db, userId).catch(() => null);
    // Best-effort for the same reason as the login path, mirrored: a database blip must never be
    // able to TRAP someone in a session. Signing out has to win over recording that they did.
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

  // Unconditional: a session we could not resolve is exactly the one most worth clearing.
  await supabase.auth.signOut();
  redirect("/login");
}
