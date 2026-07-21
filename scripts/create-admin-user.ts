/**
 * Provisions an HR/Admin account: a Supabase auth user plus the matching `users` row that is our
 * authorization source of truth. Both halves are required — an auth user with no `users` row can
 * log in and gets 403 everywhere (see `resolveHrUser`).
 *
 * Create an account (password required — there is nothing to create without one):
 *   ADMIN_PASSWORD='…' npm run create-admin -- --email admin.ist@gmail.com \
 *     --name "Admin IST" --role super_admin --permissions view_results
 *
 * Edit an existing account's role/permissions/name, leaving the password ALONE:
 *   npm run create-admin -- --email admin.ist@gmail.com --name "Admin IST" \
 *     --role hr_admin --permissions view_results
 *
 * Reset an existing account's password (the recovery path while no reset flow exists):
 *   ADMIN_PASSWORD='…' npm run create-admin -- --email … --name … --role …
 *
 * THE PASSWORD COMES FROM `ADMIN_PASSWORD`, NOT FROM ARGV. Argv is world-readable via `ps` for
 * every local user and gets recorded in shell history; an env var is neither. (Prefix the command
 * with a space in most shells to keep even the env assignment out of history.)
 *
 * IDEMPOTENT ON EMAIL: re-running never duplicates or crashes, and converges the account onto the
 * arguments given. The password is the ONE field that is only touched when ADMIN_PASSWORD is
 * actually supplied — changing a role must not force a password reset, because resetting it can
 * revoke live sessions. No ADMIN_PASSWORD on an existing account = password left untouched.
 *
 * Uses SUPABASE_SECRET_KEY, which bypasses every RLS policy. This is why it is a CLI script and
 * never an endpoint: nothing on a request path may load this file.
 */
import { eq } from "drizzle-orm";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getServerConfig } from "../lib/config.ts";
import { getDb } from "../lib/db/client.ts";
import { organizations, users } from "../lib/db/schema.ts";
import { writeAudit } from "../lib/server/audit.ts";
import { logInfo } from "../lib/server/logger.ts";

const DEFAULT_ORG_NAME = "PT Placeholder";
/** Supabase's own floor; checked here so the failure names the argument instead of the API. */
const MIN_PASSWORD_LENGTH = 8;

const argsSchema = z.object({
  email: z.email().max(320),
  /** Absent = "leave the existing password alone". Required only when creating the auth user. */
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200).optional(),
  name: z.string().min(1).max(200),
  role: z.enum(["hr_admin", "super_admin"]),
  permissions: z.array(z.string().min(1)).default([]),
});

type ParsedArgs = z.infer<typeof argsSchema>;

const USAGE =
  `Contoh (buat akun baru):\n` +
  `  ADMIN_PASSWORD='rahasia123' npm run create-admin -- --email admin@contoh.id \\\n` +
  `    --name "Admin IST" --role super_admin --permissions view_results\n` +
  `Contoh (ubah role/izin tanpa mengganti kata sandi):\n` +
  `  npm run create-admin -- --email admin@contoh.id --name "Admin IST" --role hr_admin\n` +
  `Kata sandi dibaca dari environment variable ADMIN_PASSWORD, bukan dari argumen.`;

function parseCliArgs(): ParsedArgs {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      // Still DECLARED so an old-style `--password x` fails with the explanation below instead of
      // parseArgs' bare "Unknown option". It is never read as the password.
      password: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
      // Repeatable AND comma-separated: --permissions a,b or --permissions a --permissions b.
      permissions: { type: "string", multiple: true },
    },
    strict: true,
  });

  if (values.password !== undefined) {
    throw new Error(
      `--password tidak lagi didukung: argumen bisa dilihat pengguna lain lewat 'ps' dan ` +
        `tersimpan di riwayat shell.\n\n${USAGE}`,
    );
  }

  const permissions = (values.permissions ?? [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const parsed = argsSchema.safeParse({
    email: values.email?.trim().toLowerCase(),
    // Empty string counts as "not supplied", so a bare `ADMIN_PASSWORD=` cannot turn into a
    // confusing length error.
    password: process.env.ADMIN_PASSWORD || undefined,
    name: values.name?.trim(),
    role: values.role,
    permissions,
  });

  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    // The values themselves are never echoed: one of them is a password.
    throw new Error(`Argumen tidak valid: ${fields}\n\n${USAGE}`);
  }
  return parsed.data;
}

/**
 * Single-company tenancy: one organization, looked up BY NAME so this script and Task 8's seed
 * converge on the same row regardless of which runs first.
 */
async function ensureOrganization(db: ReturnType<typeof getDb>, name: string): Promise<string> {
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, name))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [created] = await db.insert(organizations).values({ name }).returning({
    id: organizations.id,
  });
  if (!created) {
    throw new Error("Gagal membuat organisasi.");
  }
  console.log(`Organisasi dibuat: ${name}`);
  return created.id;
}

/** Only `auth.admin` is used here, so the database generics are left at their defaults. */
type AdminClient = SupabaseClient;

/**
 * Supabase's admin API has no get-user-by-email, so the page walk is the lookup. It exists because
 * the auth user can outlive a failed `users` insert: without it, a re-run after a half-finished run
 * would try to create an auth user that already exists and die.
 */
async function findAuthUserIdByEmail(supabase: AdminClient, email: string): Promise<string | null> {
  const perPage = 200;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Gagal membaca daftar pengguna auth: ${error.message}`);
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) {
      return match.id;
    }
    if (data.users.length < perPage) {
      return null;
    }
  }
}

/**
 * Creates the auth user, or returns the existing one — resetting its password ONLY when
 * ADMIN_PASSWORD was supplied. Editing a role must not be able to revoke someone's live sessions
 * as a side effect, so "no password given" means "do not touch the password".
 */
async function ensureAuthUser(supabase: AdminClient, args: ParsedArgs): Promise<string> {
  const existingId = await findAuthUserIdByEmail(supabase, args.email);

  if (existingId) {
    if (args.password === undefined) {
      console.log(
        "Pengguna auth sudah ada — kata sandi TIDAK diubah (ADMIN_PASSWORD tidak diisi).",
      );
      return existingId;
    }
    const { error } = await supabase.auth.admin.updateUserById(existingId, {
      password: args.password,
      email_confirm: true,
    });
    if (error) {
      throw new Error(`Gagal memperbarui pengguna auth: ${error.message}`);
    }
    console.log("Pengguna auth sudah ada — kata sandi direset dari ADMIN_PASSWORD.");
    return existingId;
  }

  if (args.password === undefined) {
    // Creating an account with no password would leave one nobody can log into.
    throw new Error(
      `Akun untuk email ini belum ada, jadi ADMIN_PASSWORD wajib diisi untuk membuatnya.\n\n${USAGE}`,
    );
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: args.email,
    password: args.password,
    // No mail server is wired up, and this account is created by an operator who already owns the
    // address; leaving it unconfirmed would just block the login we are provisioning.
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Gagal membuat pengguna auth: ${error?.message ?? "tidak diketahui"}`);
  }
  console.log("Pengguna auth dibuat.");
  return data.user.id;
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const config = getServerConfig();
  const orgName = process.env.SEED_ORG_NAME?.trim() || DEFAULT_ORG_NAME;

  const supabase = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const db = getDb();

  try {
    const organizationId = await ensureOrganization(db, orgName);
    const authUserId = await ensureAuthUser(supabase, args);

    const [existingRow] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, args.email))
      .limit(1);

    if (existingRow && existingRow.id !== authUserId) {
      // `users.id` MIRRORS the auth id. If they disagree, the auth user was deleted and recreated
      // behind our back, and rewriting the id would drag every FK that points at it. Refusing is
      // the honest move — this needs a human, not a guess.
      throw new Error(
        `Baris users untuk email ini sudah ada dengan id ${existingRow.id}, ` +
          `tidak cocok dengan id auth ${authUserId}. Perbaiki manual sebelum menjalankan ulang.`,
      );
    }

    if (existingRow) {
      await db
        .update(users)
        .set({
          organizationId,
          displayName: args.name,
          role: args.role,
          permissions: args.permissions,
          status: "active",
        })
        .where(eq(users.id, authUserId));
      console.log("Baris users diperbarui (idempoten).");
    } else {
      await db.insert(users).values({
        id: authUserId, // = Supabase auth user id, supplied explicitly: the column has no default.
        organizationId,
        email: args.email,
        displayName: args.name,
        role: args.role,
        permissions: args.permissions,
        status: "active",
      });
      console.log("Baris users dibuat.");
    }

    await writeAudit(db, {
      organizationId,
      actorType: "system",
      actorId: "system",
      action: existingRow ? "user.update" : "user.create",
      objectType: "user",
      objectId: authUserId,
      // No email: it is PII, and the userId already identifies the row (§19).
      metadata: { role: args.role, permissions: args.permissions, source: "create-admin-user" },
    });
    logInfo("admin_user_provisioned", {
      userId: authUserId,
      role: args.role,
      created: !existingRow,
    });

    console.log(
      `\nSelesai.\n  userId : ${authUserId}\n  role   : ${args.role}\n` +
        `  izin   : ${args.permissions.join(", ") || "(kosong)"}\n  org    : ${orgName} (${organizationId})`,
    );
  } finally {
    // postgres-js keeps the pool open and would hang the process on exit.
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
