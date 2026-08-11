export default function CompletePage() {
  return (
    <section className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-8 text-center">
        <span
          aria-hidden="true"
          className="mx-auto grid size-14 place-items-center rounded-full bg-accent text-2xl"
        >
          🎉
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-[-0.035em] text-foreground">
          Tes selesai. Terima kasih!
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Seluruh jawaban Anda sudah tersimpan dan dikunci. Tim HR akan memproses hasil tes dan
          menghubungi Anda untuk tahap berikutnya.
        </p>
        <p className="mt-6 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
          Anda dapat menutup halaman ini. Kode akses Anda tidak dapat digunakan kembali.
        </p>
      </div>
    </section>
  );
}
