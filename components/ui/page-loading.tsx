import { Skeleton } from "@/components/ui/skeleton";

/**
 * Tampilan sementara saat halaman sedang dirender di server.
 *
 * Next menampilkan `loading.tsx` begitu peserta menekan tautan, tanpa menunggu
 * server selesai. Tanpa berkas itu layar diam sepenuhnya sampai halaman baru
 * tiba — dan diam adalah hal yang paling terasa lambat, bahkan ketika
 * penantiannya sebenarnya singkat.
 */

/**
 * Untuk halaman peserta.
 *
 * Sengaja hanya berupa teks tenang, bukan kerangka yang meniru tata letak soal.
 * Kerangka yang berkedip di tengah tes berbatas waktu justru menambah tegang,
 * dan bentuknya yang mirip soal bisa membuat peserta mengira soal sudah tampil.
 */
export function ParticipantLoading({ label = "Menyiapkan…" }: { readonly label?: string }) {
  return (
    <section className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
        <span
          aria-hidden="true"
          className="size-8 animate-spin rounded-full border-2 border-border border-t-primary"
        />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </section>
  );
}

/**
 * Untuk halaman HR dan admin.
 *
 * Di sini kerangka justru membantu: tata letaknya tetap, dan menahan pergeseran
 * saat isi sebenarnya masuk.
 */
export function DashboardLoading() {
  return (
    <div className="space-y-6 p-1" role="status" aria-live="polite">
      <span className="sr-only">Memuat halaman…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((slot) => (
          <Skeleton key={slot} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <Skeleton key={row} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
