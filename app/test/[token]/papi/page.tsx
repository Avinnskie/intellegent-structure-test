import { redirect } from "next/navigation";
import { StartIstButton } from "@/components/participant/start-ist-button";
import { getDb } from "@/lib/db/client.ts";
import { getPapiState } from "@/lib/server/papi-participant.ts";

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} menit ${String(seconds).padStart(2, "0")} detik`;
}

export default async function PapiRestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let state;
  try {
    state = await getPapiState(getDb(), token);
  } catch {
    redirect("/test");
  }

  if (state.sessionStatus !== "papi_rest") {
    redirect(state.nextRoute);
  }

  return (
    <section className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-8">
        <h1 className="mt-5 text-center text-2xl font-bold tracking-[-0.035em] text-foreground">
          Kuesioner kepribadian selesai
        </h1>

        <p className="mt-3 text-center text-sm leading-6 text-muted-foreground">
          Jawaban Anda sudah tersimpan dan terkunci. Berikutnya adalah tes kemampuan (IST), yang
          terdiri dari sembilan bagian.
        </p>

        <div className="mt-7 rounded-xl border border-border bg-muted p-5">
          <h2 className="text-sm font-semibold text-foreground">Yang perlu Anda ketahui</h2>
          <ul className="mt-3 space-y-2.5 text-sm leading-6 text-muted-foreground">
            <li>
              <strong className="font-semibold text-foreground">
                Setiap bagian dibatasi waktu.
              </strong>{" "}
              Berbeda dengan kuesioner tadi, waktu akan berjalan mundur dan bagian tertutup sendiri
              saat habis.
            </li>
            <li>
              Boleh istirahat dulu sebelum memulai. Anda dapat menutup halaman ini dan kembali
              memakai kode akses yang sama.
            </li>
            <li>
              Setelah sebuah bagian dimulai, waktunya berjalan terus — pastikan Anda siap sebelum
              menekan tombol di bawah.
            </li>
            <li>Ada jawaban benar dan salah pada bagian ini, tidak seperti kuesioner tadi.</li>
          </ul>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Waktu mengerjakan kuesioner: {formatElapsed(state.elapsedSeconds)}
        </p>

        <StartIstButton token={token} />
      </div>
    </section>
  );
}
