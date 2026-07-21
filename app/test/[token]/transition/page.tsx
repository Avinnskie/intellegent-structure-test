import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client.ts";
import { getSessionState } from "@/lib/server/participant-session.ts";

/**
 * The between-subtests breather: "that one is closed, here is where you go next."
 *
 * Unlike the other token routes this page never redirects on a route mismatch — it is a
 * deliberately transient stop the participant may land on from any closing action, and its whole
 * job is to hand them the CURRENT `nextRoute`. It shows nothing about answers or scores.
 */
export default async function TransitionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
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
      <div className="w-full max-w-xl rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-8 text-center">
        <span
          aria-hidden="true"
          className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--accent-warm-soft)] text-2xl"
        >
          ✓
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-[-0.035em] text-[var(--text-primary)]">
          Subtes selesai
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Jawaban Anda sudah terkunci. Peserta tidak dapat kembali ke subtes yang sudah ditutup.
        </p>
        <Link
          href={state.nextRoute}
          className="mt-7 inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-6 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
        >
          {isFinished ? "Lihat halaman penutup" : "Lanjut ke subtes berikutnya"}
        </Link>
      </div>
    </section>
  );
}
