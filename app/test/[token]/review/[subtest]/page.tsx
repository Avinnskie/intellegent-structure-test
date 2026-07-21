import Link from "next/link";
import { redirect } from "next/navigation";
import { CompleteSubtestButton } from "@/components/participant/complete-subtest-button";
import { getDb } from "@/lib/db/client.ts";
import { getUnanswered } from "@/lib/server/participant-responses.ts";
import { getSessionState } from "@/lib/server/participant-session.ts";

/**
 * The "Belum Dijawab" checkpoint before handing a subtest in (spec §8). Reachable only while the
 * subtest is live — the same guard as the question page — so the list can never describe a closed
 * attempt. It carries navigation targets only: no prompts, no values, nothing worth shielding.
 */
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

  // The service already returns only pending items (unanswered + skipped), in local order.
  const pending = unanswered.items;
  const code = state.currentSubtest.code;

  return (
    <section className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-8">
        <h1 className="text-2xl font-bold tracking-[-0.035em] text-[var(--text-primary)]">
          Periksa sebelum menutup subtes {code}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Setelah subtes ditutup, seluruh jawaban terkunci dan tidak dapat dibuka kembali. Soal yang
          belum dijawab dinilai 0.
        </p>

        {pending.length > 0 ? (
          <div className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {pending.length} soal belum dijawab
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {pending.map((item) => (
                <Link
                  key={item.itemNumber}
                  href={`/test/${token}/question/${code}/${item.localNumber}`}
                  className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-semibold hover:bg-[var(--surface-subtle)] ${
                    item.status === "skipped"
                      ? "border-[var(--status-warning)] text-[var(--status-warning)]"
                      : "border-[var(--border-default)] text-[var(--text-primary)]"
                  }`}
                >
                  {item.localNumber}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-6 rounded-xl bg-[var(--surface-base)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
            Semua soal sudah dijawab.
          </p>
        )}

        <div className="mt-8 grid gap-3 border-t border-[var(--border-subtle)] pt-6 sm:grid-cols-2">
          <Link
            href={`/test/${token}/question/${code}/${pending[0]?.localNumber ?? 1}`}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-base)]"
          >
            Kembali mengerjakan
          </Link>
          <CompleteSubtestButton token={token} code={code} unansweredCount={pending.length} />
        </div>
      </div>
    </section>
  );
}
