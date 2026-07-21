import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/server/safe-redirect";

export const metadata: Metadata = {
  title: "Masuk — Portal IST",
};

type LoginPageProps = {
  readonly searchParams: Promise<{ next?: string; denied?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  // Sanitized here, at the edge of the app, so the client form only ever holds a vetted path.
  const next = safeNextPath(params.next);

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center px-4 py-10 sm:py-14">
      <section
        aria-labelledby="login-heading"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] shadow-[var(--shadow-subtle)]"
      >
        <div className="lms-grid-pattern relative overflow-hidden bg-[var(--accent-primary)] px-6 py-8 text-white sm:px-8">
          <div className="relative z-10">
            <h1
              id="login-heading"
              className="mt-3 text-pretty text-[clamp(1.75rem,3vw,2.25rem)] font-bold leading-[1.1] tracking-[-0.04em]"
            >
              Masuk ke IST Dashboard.
            </h1>
          </div>
          <div className="absolute -bottom-16 -right-12 size-44 rounded-full border-[36px] border-white/5" />
        </div>

        <div className="p-6 sm:p-8">
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            Gunakan email dan kata sandi akun HR atau Admin Anda.
          </p>

          <LoginForm next={next} denied={params.denied === "1"} />

          <div className="mt-7 border-t border-[var(--border-subtle)] pt-5">
            <Link
              className="inline-block text-sm font-semibold text-[var(--accent-primary)] hover:underline"
              href="/"
            >
              Kembali ke halaman peserta
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
