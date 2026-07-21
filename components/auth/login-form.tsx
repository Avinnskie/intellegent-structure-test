"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/app/login/actions";

type LoginFormProps = {
  /** Already sanitized by the page via `safeNextPath` — round-tripped so a deep link survives login. */
  readonly next: string;
  /** Set when a layout bounced an authenticated-but-unprovisioned or deactivated user back here. */
  readonly denied: boolean;
};

const initialState: LoginState = { message: null };

export function LoginForm({ next, denied }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(signIn, initialState);
  const message =
    state.message ?? (denied ? "Akun Anda tidak memiliki akses ke portal ini." : null);

  return (
    <form className="mt-7 min-w-0 space-y-4" action={formAction}>
      <input type="hidden" name="next" value={next} />

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-[var(--text-primary)]">Email</span>
        <input
          className="min-w-0 w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-3.5 text-base text-[var(--text-primary)]"
          type="email"
          name="email"
          autoComplete="username"
          required
          placeholder="nama@perusahaan.co.id"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-[var(--text-primary)]">Kata sandi</span>
        <input
          className="min-w-0 w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-3.5 text-base text-[var(--text-primary)]"
          placeholder="••••••••"
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
      >
        {isPending ? "Memverifikasi…" : "Masuk"}
      </button>

      {message ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--status-error)]/30 bg-[color-mix(in_srgb,var(--status-error)_8%,white)] px-4 py-3 text-sm leading-6 text-[var(--status-error)]"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
