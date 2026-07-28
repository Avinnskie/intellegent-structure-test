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
const MIN_PASSWORD_LENGTH = 8;

const argsSchema = z.object({
  email: z.email().max(320),
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
      password: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
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
    password: process.env.ADMIN_PASSWORD || undefined,
    name: values.name?.trim(),
    role: values.role,
    permissions,
  });

  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Argumen tidak valid: ${fields}\n\n${USAGE}`);
  }
  return parsed.data;
}

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

type AdminClient = SupabaseClient;

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
    throw new Error(
      `Akun untuk email ini belum ada, jadi ADMIN_PASSWORD wajib diisi untuk membuatnya.\n\n${USAGE}`,
    );
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: args.email,
    password: args.password,
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
        id: authUserId,
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
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
