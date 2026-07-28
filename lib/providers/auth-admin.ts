import { createClient } from "@supabase/supabase-js";
import { getServerConfig } from "../config.ts";

export type AuthAdminProvider = {
  createUser(email: string, password: string): Promise<string>;
  setPassword(userId: string, password: string): Promise<void>;
};

const EMAIL_TAKEN_MARKER = "EMAIL_TAKEN";

export function isEmailTakenError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(EMAIL_TAKEN_MARKER);
}

export function createSupabaseAuthAdminProvider(): AuthAdminProvider {
  const config = getServerConfig();
  const client = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    async createUser(email, password) {
      const { data, error } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) {
        const isDuplicate =
          error?.code === "email_exists" || /already.*register|exist/i.test(error?.message ?? "");
        throw new Error(
          isDuplicate
            ? `${EMAIL_TAKEN_MARKER}: ${email}`
            : `Gagal membuat pengguna auth: ${error?.message ?? "tidak diketahui"}`,
        );
      }
      return data.user.id;
    },
    async setPassword(userId, password) {
      const { error } = await client.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (error) {
        throw new Error(`Gagal mengatur kata sandi: ${error.message}`);
      }
    },
  };
}

export function createMemoryAuthAdminProvider(): AuthAdminProvider & {
  accounts: Map<string, { email: string; password: string }>;
} {
  const accounts = new Map<string, { email: string; password: string }>();
  let sequence = 0;

  return {
    accounts,
    createUser(email, password) {
      for (const account of accounts.values()) {
        if (account.email === email) {
          return Promise.reject(new Error(`${EMAIL_TAKEN_MARKER}: ${email}`));
        }
      }
      sequence += 1;
      const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
      accounts.set(id, { email, password });
      return Promise.resolve(id);
    },
    setPassword(userId, password) {
      const account = accounts.get(userId);
      if (!account) {
        return Promise.reject(new Error("Pengguna auth tidak ditemukan."));
      }
      accounts.set(userId, { ...account, password });
      return Promise.resolve();
    },
  };
}
