/**
 * Where a participant waits while an admin has the session frozen (`paused_by_admin`). Static: it
 * says "wait", never "done" — the closing page would tell them a paused test is over, and naming
 * the WHY is HR's call, not this page's.
 */
export default function PausedPage() {
  return (
    <section className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-8 text-center">
        <span
          aria-hidden="true"
          className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--surface-strong)] text-2xl"
        >
          ⏸
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-[-0.035em] text-[var(--text-primary)]">
          Sesi tes sedang dijeda
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Pengawas menjeda sesi Anda untuk sementara. Jangan tutup halaman ini — muat ulang secara
          berkala atau ikuti arahan pengawas untuk melanjutkan.
        </p>
        <p className="mt-6 border-t border-[var(--border-subtle)] pt-5 text-xs leading-5 text-[var(--text-muted)]">
          Jika jeda berlangsung lama, hubungi HR atau pengawas ruangan Anda.
        </p>
      </div>
    </section>
  );
}
