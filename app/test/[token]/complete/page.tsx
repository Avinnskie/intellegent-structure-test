/**
 * The closing screen. Spec §16: the participant sees NO results on the MVP — scoring happens on
 * HR's side after this point. Static on purpose: it reads nothing and calls nothing, so it can
 * never leak a status, a score, or an error detail, and it stays readable even if the session's
 * token has since been invalidated.
 */
export default function CompletePage() {
  return (
    <section className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-8 text-center">
        <span
          aria-hidden="true"
          className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--accent-warm-soft)] text-2xl"
        >
          🎉
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-[-0.035em] text-[var(--text-primary)]">
          Tes selesai. Terima kasih!
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Seluruh jawaban Anda sudah tersimpan dan dikunci. Tim HR akan memproses hasil tes dan
          menghubungi Anda untuk tahap berikutnya.
        </p>
        <p className="mt-6 border-t border-[var(--border-subtle)] pt-5 text-xs leading-5 text-[var(--text-muted)]">
          Anda dapat menutup halaman ini. Kode akses Anda tidak dapat digunakan kembali.
        </p>
      </div>
    </section>
  );
}
