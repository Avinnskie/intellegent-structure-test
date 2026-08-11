import Link from "next/link";

export default function UnavailablePage() {
  return (
    <section className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-8 text-center">
        <span
          aria-hidden="true"
          className="mx-auto grid size-14 place-items-center rounded-full bg-muted text-2xl"
        >
          🔒
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-[-0.035em] text-foreground">
          Sesi tes tidak tersedia
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Sesi ini tidak dapat dilanjutkan. Hubungi HR untuk informasi lebih lanjut atau untuk
          dijadwalkan ulang.
        </p>
        <Link
          href="/test"
          className="mt-7 inline-flex h-12 items-center justify-center rounded-xl border border-border px-6 text-sm font-semibold text-foreground hover:bg-background"
        >
          Kembali ke halaman kode akses
        </Link>
      </div>
    </section>
  );
}
