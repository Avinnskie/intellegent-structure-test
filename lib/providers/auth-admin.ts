/**
 * Admin surface of the auth provider (T-users): create accounts and set passwords.
 *
 * Uses SUPABASE_SECRET_KEY, which bypasses RLS — so this module is imported ONLY by the
 * super_admin-gated user service, never by anything on a participant or plain-HR path. The
 * interface exists so integration tests exercise the real service logic with an in-memory auth
 * instead of mocking the service.
 */
import { createClient } from "@supabase/supabase-js";
import { getServerConfig } from "../config.ts";

export type AuthAdminProvider = {
  /** Creates a confirmed auth user and returns its id. Throws if the email already exists. */
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
        // No mail server is wired up, and the account is provisioned by an operator who owns the
        // address; unconfirmed would just block the login being created.
        email_confirm: true,
      });
      if (error || !data.user) {
        // Supabase reports duplicates with a 422/email_exists; normalize so the service can turn
        // it into a friendly 409 without depending on Supabase's message strings elsewhere.
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

/** In-memory provider for tests: same contract, no network. */
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
