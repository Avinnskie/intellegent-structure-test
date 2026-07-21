import Link from "next/link";

/**
 * The fail-closed landing for a session that cannot continue — cancelled, expired, invalidated, or
 * a broken row. Deliberately says nothing about WHICH: the distinction is HR's information, and a
 * participant holding a revoked token learns only that the session is unavailable (spec §13/§19).
 */
export default function UnavailablePage() {
  return (
    <section className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-8 text-center">
        <span
          aria-hidden="true"
          className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--surface-strong)] text-2xl"
        >
          🔒
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-[-0.035em] text-[var(--text-primary)]">
          Sesi tes tidak tersedia
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Sesi ini tidak dapat dilanjutkan. Hubungi HR untuk informasi lebih lanjut atau untuk
          dijadwalkan ulang.
        </p>
        <Link
          href="/test"
          className="mt-7 inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-default)] px-6 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-base)]"
        >
          Kembali ke halaman kode akses
        </Link>
      </div>
    </section>
  );
}
