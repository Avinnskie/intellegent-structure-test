import { toDisplayHtml } from "@/lib/domain/rich-text.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Menampilkan teks berformat yang ditulis HR.
 *
 * Sengaja terpisah dari `rich-text-editor.tsx`: berkas itu menarik Tiptap, dan
 * halaman peserta tidak boleh ikut mengunduh seluruh editor hanya untuk
 * membaca satu soal.
 *
 * Nilai selalu melewati `toDisplayHtml`, jadi pemanggil tidak pernah bisa
 * menyisipkan HTML mentah walau tanpa sengaja.
 */
export function RichText({
  value,
  className,
}: {
  readonly value: string;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "[&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold",
        "[&_h3]:text-base [&_h3]:font-semibold",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_p]:my-2 [&_h1]:my-3 [&_h2]:my-3 [&_h3]:my-2 [&_li]:my-1",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      // Aman: `toDisplayHtml` membuang seluruh tag di luar daftar izin dan
      // seluruh atribut tanpa kecuali. Lihat lib/domain/rich-text.ts.
      dangerouslySetInnerHTML={{ __html: toDisplayHtml(value) }}
    />
  );
}
