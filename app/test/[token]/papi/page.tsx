import Link from "next/link";
import { redirect } from "next/navigation";
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

  if (state.sessionStatus !== "papi_rest" && state.sessionStatus !== "papi_tutorial") {
    redirect(state.nextRoute);
  }

  const resumed = state.answeredCount > 0;

  return (
    <section className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-8">
        <h1 className="mt-5 text-center text-2xl font-bold tracking-[-0.035em] text-foreground">
          {resumed ? "Lanjutkan bagian kedua" : "Bagian pertama selesai"}
        </h1>

        <p className="mt-3 text-center text-sm leading-6 text-muted-foreground">
          {resumed
            ? `Anda sudah menjawab ${state.answeredCount} dari ${state.itemCount} nomor. Jawaban tersimpan dan dapat dilanjutkan.`
            : "Jawaban Anda pada bagian pertama sudah tersimpan dan terkunci. Berikutnya adalah kuesioner kepribadian."}
        </p>

        <div className="mt-7 rounded-xl border border-border bg-muted p-5">
          <h2 className="text-sm font-semibold text-foreground">Yang perlu Anda ketahui</h2>
          <ul className="mt-3 space-y-2.5 text-sm leading-6 text-muted-foreground">
            <li>Tidak ada batas waktu tetapi kerjakan dengan tenang.</li>
            <li>
              Boleh istirahat/stop terlebih dulu. Anda dapat menutup halaman ini dan kembali memakai
              kode akses yang sama.
            </li>
            <li>
              <strong className="font-semibold text-foreground">
                Tidak ada jawaban benar atau salah.
              </strong>{" "}
              Setiap nomor memuat dua pernyataan; pilih yang paling menggambarkan diri Anda.
            </li>
            <li>Seluruh {state.itemCount} nomor wajib terisi sebelum kuesioner dapat dikirim.</li>
          </ul>
        </div>

        {resumed ? (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Waktu mengerjakan tercatat sejauh ini: {formatElapsed(state.elapsedSeconds)}
          </p>
        ) : null}

        <Link
          href={`/test/${token}/papi/tutorial`}
          className="mt-7 flex h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-white hover:bg-primary/90"
        >
          {resumed ? "Lanjutkan kuesioner" : "Mulai kuesioner kepribadian"}
        </Link>
      </div>
    </section>
  );
}
