"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/app/login/actions";

type LoginFormProps = {
  readonly next: string;
  readonly denied: boolean;
};

const initialState: LoginState = { message: null };

export function LoginForm({ next, denied }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(signIn, initialState);
  const message =
    state.message ?? (denied ? "Akun Anda tidak memiliki akses ke portal ini." : null);

  return (
    <form className="min-w-0 space-y-4" action={formAction}>
      <input type="hidden" name="next" value={next} />

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-foreground">Email</span>
        <input
          className="min-w-0 w-full rounded-xl border border-border bg-background px-4 py-3.5 text-base text-foreground"
          type="email"
          name="email"
          autoComplete="username"
          required
          placeholder="nama@perusahaan.co.id"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-foreground">Kata sandi</span>
        <input
          className="min-w-0 w-full rounded-xl border border-border bg-background px-4 py-3.5 text-base text-foreground"
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
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {isPending ? "Memverifikasi…" : "Masuk"}
      </button>

      {message ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--destructive)]/30 bg-[color-mix(in_srgb,var(--destructive)_8%,white)] px-4 py-3 text-sm leading-6 text-destructive"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
