import { redirect } from "next/navigation";
import { PapiStartButton } from "@/components/participant/papi-start-button";
import { getDb } from "@/lib/db/client.ts";
import { getPapiState } from "@/lib/server/papi-participant.ts";

const EXAMPLE = {
  optionAText: "Saya seorang pekerja giat",
  optionBText: "Saya bukan seorang murung",
};

export default async function PapiTutorialPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let state;
  try {
    state = await getPapiState(getDb(), token);
  } catch {
    redirect("/test");
  }

  if (state.sessionStatus === "papi_question") {
    redirect(`/test/${token}/papi/question`);
  }
  if (state.sessionStatus !== "papi_tutorial") {
    redirect(state.nextRoute);
  }

  return (
    <section className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-8">
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.035em] text-foreground">
          Kuesioner kepribadian
        </h1>

        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Anda akan membaca {state.itemCount} nomor. Setiap nomor berisi dua pernyataan. Pilih satu
          pernyataan yang <strong className="font-semibold">paling menggambarkan diri Anda</strong>{" "}
          — meskipun keduanya terasa benar, atau keduanya terasa kurang cocok.
        </p>

        <div className="mt-6 rounded-xl border border-border bg-muted p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Contoh
          </p>
          <div className="mt-3 space-y-2">
            <div className="flex gap-3 rounded-lg border border-border bg-card p-3.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-xs font-bold">
                A
              </span>
              <span className="text-sm leading-6 text-foreground">{EXAMPLE.optionAText}</span>
            </div>
            <div className="flex gap-3 rounded-lg border border-border bg-card p-3.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-xs font-bold">
                B
              </span>
              <span className="text-sm leading-6 text-foreground">{EXAMPLE.optionBText}</span>
            </div>
          </div>
        </div>

        <ul className="mt-6 space-y-2.5 text-sm leading-6 text-muted-foreground">
          <li>Tidak ada jawaban benar atau salah — jawablah sejujurnya.</li>
          <li>Tidak ada batas waktu. Lama pengerjaan dicatat sebagai catatan, bukan penalti.</li>
        </ul>

        <PapiStartButton token={token} resumed={state.answeredCount > 0} />
      </div>
    </section>
  );
}
