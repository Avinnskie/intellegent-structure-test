/**
 * Portal user management from the web (spec §4.3: Super Admin mengelola akun HR).
 *
 * Rules that carry the weight:
 * - SUPER_ADMIN ONLY, re-checked here — the service is the last line, not the nav.
 * - LOCKOUT GUARDS: an admin can never deactivate themself or drop their own super_admin role.
 *   The web UI must not be able to strand the company with zero working admins.
 * - The password crosses this module exactly once, on its way to the auth provider. It is never
 *   stored, never logged, never audited — the audit rows carry email/role/status only.
 * - `users.id` mirrors the Supabase auth id (the login joins on it), so creation is auth-first and
 *   the row insert uses the returned id. A duplicate email answers 409 without leaking which side
 *   (auth or row) already had it.
 */
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import { users } from "../db/schema.ts";
import { isEmailTakenError, type AuthAdminProvider } from "../providers/auth-admin.ts";
import type { AuthContext, UserRole } from "./authz.ts";
import { writeAudit } from "./audit.ts";

const FORBIDDEN_MESSAGE = "Anda tidak memiliki izin untuk tindakan ini.";
const EMAIL_TAKEN_MESSAGE = "Email ini sudah terdaftar.";
const NOT_FOUND_MESSAGE = "Data tidak ditemukan.";
const SELF_DEACTIVATE_MESSAGE = "Anda tidak dapat menonaktifkan akun Anda sendiri.";
const SELF_DEMOTE_MESSAGE = "Anda tidak dapat melepas role Super Admin dari akun Anda sendiri.";

function requireSuperAdmin(ctx: AuthContext): void {
  if (ctx.role !== "super_admin") {
    throw new ApiError("FORBIDDEN", FORBIDDEN_MESSAGE, 403);
  }
}

function notFound(): ApiError {
  return new ApiError("NOT_FOUND", NOT_FOUND_MESSAGE, 404);
}

export type PortalUserDto = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  permissions: readonly string[];
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
};

export async function listPortalUsers(db: DbLike, ctx: AuthContext): Promise<PortalUserDto[]> {
  requireSuperAdmin(ctx);
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    permissions: row.permissions,
    status: row.status,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export const createUserSchema = z.object({
  email: z.email().max(320),
  // Matches Supabase's default minimum; the operator hands this to the new user out of band.
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(200),
  role: z.enum(["hr_admin", "super_admin"]),
  viewResults: z.boolean().default(false),
});

export async function createPortalUser(
  db: DbLike,
  auth: AuthAdminProvider,
  ctx: AuthContext,
  input: unknown,
): Promise<PortalUserDto> {
  requireSuperAdmin(ctx);
  const data = createUserSchema.parse(input);
  const email = data.email.trim().toLowerCase();

  // Pre-check our own table first: the common duplicate answers without an auth round trip.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    throw new ApiError("EMAIL_TAKEN", EMAIL_TAKEN_MESSAGE, 409);
  }

  // Auth first: the row's id MUST be the auth id. If the row insert then fails, the CLI
  // (create-admin) reconciles the orphan on its next run — documented behavior since T7.
  let authUserId: string;
  try {
    authUserId = await auth.createUser(email, data.password);
  } catch (error) {
    if (isEmailTakenError(error)) {
      throw new ApiError("EMAIL_TAKEN", EMAIL_TAKEN_MESSAGE, 409);
    }
    throw error;
  }

  const permissions = data.viewResults ? ["view_results"] : [];

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({
        id: authUserId,
        // Single-company tenancy: new accounts join the creator's organization.
        organizationId: ctx.organizationId,
        email,
        displayName: data.displayName,
        role: data.role,
        permissions,
        status: "active",
      })
      .returning();
    if (!row) {
      throw new Error("Baris users gagal dibuat.");
    }

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "user.created",
      objectType: "user",
      objectId: row.id,
      // Email + role + permissions — NEVER the password.
      metadata: { email, role: data.role, permissions },
    });

    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
      permissions: row.permissions,
      status: row.status,
      lastLoginAt: null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export const updateUserSchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  role: z.enum(["hr_admin", "super_admin"]).optional(),
  viewResults: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  /** Optional reset. Absent = the password is not touched (a role edit must never log people out). */
  newPassword: z.string().min(8).max(200).optional(),
});

export async function updatePortalUser(
  db: DbLike,
  auth: AuthAdminProvider,
  ctx: AuthContext,
  userId: string,
  input: unknown,
): Promise<PortalUserDto> {
  requireSuperAdmin(ctx);
  const data = updateUserSchema.parse(input);
  if (!z.uuid().safeParse(userId).success) {
    throw notFound();
  }

  // Lockout guards BEFORE any write.
  if (userId === ctx.userId && data.status === "inactive") {
    throw new ApiError("SELF_DEACTIVATE", SELF_DEACTIVATE_MESSAGE, 409);
  }
  if (userId === ctx.userId && data.role === "hr_admin") {
    throw new ApiError("SELF_DEMOTE", SELF_DEMOTE_MESSAGE, 409);
  }

  const updated = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1);
    if (!current) {
      throw notFound();
    }

    const permissions =
      data.viewResults === undefined
        ? current.permissions
        : data.viewResults
          ? [...new Set([...current.permissions, "view_results"])]
          : current.permissions.filter((permission) => permission !== "view_results");

    const [row] = await tx
      .update(users)
      .set({
        displayName: data.displayName ?? current.displayName,
        role: data.role ?? current.role,
        status: data.status ?? current.status,
        permissions,
      })
      .where(eq(users.id, userId))
      .returning();
    if (!row) {
      throw new Error("Baris users gagal diperbarui.");
    }

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "user.updated",
      objectType: "user",
      objectId: row.id,
      metadata: {
        email: row.email,
        role: row.role,
        status: row.status,
        permissions: row.permissions,
        passwordReset: data.newPassword !== undefined,
      },
    });

    return row;
  });

  // Outside the transaction: an auth API call must not hold row locks hostage, and a password
  // failure after a successful row update is reported honestly by the throw below.
  if (data.newPassword !== undefined) {
    await auth.setPassword(userId, data.newPassword);
  }

  return {
    id: updated.id,
    email: updated.email,
    displayName: updated.displayName,
    role: updated.role,
    permissions: updated.permissions,
    status: updated.status,
    lastLoginAt: updated.lastLoginAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  };
}
