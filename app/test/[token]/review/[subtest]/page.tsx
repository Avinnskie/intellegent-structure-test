import Link from "next/link";
import { redirect } from "next/navigation";
import { CompleteSubtestButton } from "@/components/participant/complete-subtest-button";
import { getDb } from "@/lib/db/client.ts";
import { getUnanswered } from "@/lib/server/participant-responses.ts";
import { getSessionState } from "@/lib/server/participant-session.ts";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string; subtest: string }>;
}) {
  const { token, subtest } = await params;
  const db = getDb();

  let state;
  try {
    state = await getSessionState(db, token);
  } catch {
    redirect("/test");
  }

  if (state.sessionStatus !== "question" || state.currentSubtest?.code !== subtest) {
    redirect(state.nextRoute);
  }

  let unanswered;
  try {
    unanswered = await getUnanswered(db, token, subtest);
  } catch {
    redirect(state.nextRoute);
  }

  const pending = unanswered.items;
  const code = state.currentSubtest.code;

  return (
    <section className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-8">
        <h1 className="text-2xl font-bold tracking-[-0.035em] text-foreground">
          Periksa sebelum menutup subtes {code}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Setelah subtes ditutup, seluruh jawaban terkunci dan tidak dapat dibuka kembali. Soal yang
          belum dijawab dinilai 0.
        </p>

        {pending.length > 0 ? (
          <div className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {pending.length} soal belum dijawab
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {pending.map((item) => (
                <Link
                  key={item.itemNumber}
                  href={`/test/${token}/question/${code}/${item.localNumber}`}
                  className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-semibold hover:bg-muted ${
                    item.status === "skipped"
                      ? "border-[var(--color-amber-500, #f59e0b)] text-[var(--color-amber-500, #f59e0b)]"
                      : "border-border text-foreground"
                  }`}
                >
                  {item.localNumber}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-6 rounded-xl bg-background p-4 text-sm leading-6 text-muted-foreground">
            Semua soal sudah dijawab.
          </p>
        )}

        <div className="mt-8 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
          <Link
            href={`/test/${token}/question/${code}/${pending[0]?.localNumber ?? 1}`}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold text-foreground hover:bg-background"
          >
            Kembali mengerjakan
          </Link>
          <CompleteSubtestButton token={token} code={code} unansweredCount={pending.length} />
        </div>
      </div>
    </section>
  );
}
