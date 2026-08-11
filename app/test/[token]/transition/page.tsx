import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client.ts";
import { getSessionState } from "@/lib/server/participant-session.ts";

export default async function TransitionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let state;
  try {
    state = await getSessionState(getDb(), token);
  } catch {
    redirect("/test");
  }

  const isFinished = state.sessionStatus === "finished";

  return (
    <section className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-8 text-center">
        <span
          aria-hidden="true"
          className="mx-auto grid size-14 place-items-center rounded-full bg-accent text-2xl"
        >
          ✓
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-[-0.035em] text-foreground">
          Subtes selesai
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Jawaban Anda sudah terkunci. Peserta tidak dapat kembali ke subtes yang sudah ditutup.
        </p>
        <Link
          href={state.nextRoute}
          className="mt-7 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-white hover:bg-primary/90"
        >
          {isFinished ? "Lihat halaman penutup" : "Lanjut ke subtes berikutnya"}
        </Link>
      </div>
    </section>
  );
}
