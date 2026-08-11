export default function PausedPage() {
  return (
    <section className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-8 text-center">
        <span
          aria-hidden="true"
          className="mx-auto grid size-14 place-items-center rounded-full bg-muted text-2xl"
        >
          ⏸
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-[-0.035em] text-foreground">
          Sesi tes sedang dijeda
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Pengawas menjeda sesi Anda untuk sementara. Jangan tutup halaman ini — muat ulang secara
          berkala atau ikuti arahan pengawas untuk melanjutkan.
        </p>
        <p className="mt-6 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
          Jika jeda berlangsung lama, hubungi HR atau pengawas ruangan Anda.
        </p>
      </div>
    </section>
  );
}
