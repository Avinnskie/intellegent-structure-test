import Link from "next/link";
import { sessionStatusLabel } from "@/components/hr/session-status-label";
import { AppShell } from "@/components/ui/app-shell";
import { getDb } from "@/lib/db/client.ts";
import type { SessionStatus } from "@/lib/domain/session-state.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { listSessions } from "@/lib/server/hr.ts";

/** Sessions that have finished testing — the population "Hasil & laporan" is about. */
const RESULT_STATUSES: ReadonlySet<SessionStatus> = new Set([
  "test_completed",
  "needs_ge_scoring",
  "calculated",
  "reviewed",
  "final",
  "needs_review",
]);

/** The results workspace: every post-test session with links to its result and report pages. */
export default async function HrResultsListPage() {
  const db = getDb();
  const ctx = await requireHrUser(db);
  const sessions = (await listSessions(db, ctx)).filter((row) =>
    RESULT_STATUSES.has(row.status as SessionStatus),
  );

  return (
    <AppShell title="Hasil & laporan">
      <section className="overflow-x-auto rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
            Sesi selesai tes
          </h2>
          <p className="text-sm text-[var(--text-muted)]">{sessions.length} sesi</p>
        </div>
        {sessions.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-base)] p-6 text-sm leading-6 text-[var(--text-secondary)]">
            Belum ada sesi yang menyelesaikan tes. Setelah peserta selesai, seluruh subtes termasuk
            GE dinilai dari kunci jawaban dan hasil dihitung otomatis untuk finalisasi HR.
          </p>
        ) : (
          <table className="mt-6 min-w-full text-left">
            <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <tr>
                <th className="pb-3">Peserta</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Selesai tes</th>
                <th className="pb-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="text-sm text-[var(--text-primary)]">
              {sessions.map((row) => (
                <tr key={row.sessionId} className="border-t border-[var(--border-subtle)]">
                  <td className="py-4 font-semibold">{row.candidateName}</td>
                  <td className="py-4">{sessionStatusLabel(row.status as SessionStatus)}</td>
                  <td className="py-4">
                    {row.completedAt ? new Date(row.completedAt).toLocaleDateString("id-ID") : "—"}
                  </td>
                  <td className="py-4">
                    <span className="flex flex-wrap gap-4">
                      <Link
                        href={`/hr/results/${row.sessionId}`}
                        className="font-semibold text-[var(--accent-primary)]"
                      >
                        Hasil
                      </Link>
                      {row.status === "final" ? (
                        <Link
                          href={`/hr/reports/${row.sessionId}`}
                          className="font-semibold text-[var(--accent-primary)]"
                        >
                          Laporan
                        </Link>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AppShell>
  );
}
