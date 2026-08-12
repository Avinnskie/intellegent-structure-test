import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client.ts";
import { getSessionState } from "@/lib/server/participant-session.ts";

/**
 * Layar penutup.
 *
 * Halaman ini sebelumnya statis tanpa penjaga status apa pun, sehingga siapa
 * pun yang membuka URL-nya melihat "Tes selesai" — termasuk peserta yang baru
 * menyelesaikan PAPI dan masih punya sembilan subtes IST di depannya. Pesan
 * palsu itu berbahaya: peserta menutup halaman dan tidak kembali.
 *
 * Jadi status sesi diperiksa lebih dulu, dan yang belum benar-benar selesai
 * dipantulkan ke tahap yang seharusnya.
 */
export default async function CompletePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let state;
  try {
    state = await getSessionState(getDb(), token);
  } catch {
    redirect("/test");
  }

  if (state.sessionStatus !== "finished") {
    redirect(state.nextRoute);
  }

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
