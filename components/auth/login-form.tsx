"use client";

import { useState, type FormEvent } from "react";

type LoginFormProps = {
  readonly next: string;
  readonly denied: boolean;
};

type LoginResponse = {
  readonly redirectTo?: string;
  readonly error?: { readonly message?: string };
};

const CONNECTION_ERROR_MESSAGE = "Tidak dapat menghubungi server. Coba lagi.";

export function LoginForm({ next, denied }: LoginFormProps) {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    denied ? "Akun Anda tidak memiliki akses ke portal ini." : null,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { accept: "application/json" },
        body: new FormData(event.currentTarget),
      });
      const payload = (await response.json().catch(() => ({}))) as LoginResponse;

      if (!response.ok) {
        setMessage(payload.error?.message ?? CONNECTION_ERROR_MESSAGE);
        setIsPending(false);
        return;
      }

      window.location.assign(payload.redirectTo ?? "/hr");
    } catch {
      setMessage(CONNECTION_ERROR_MESSAGE);
      setIsPending(false);
    }
  }

  return (
    <form className="min-w-0 space-y-4" onSubmit={handleSubmit}>
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
