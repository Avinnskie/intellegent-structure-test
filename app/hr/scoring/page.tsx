import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { listSessions } from "@/lib/server/hr.ts";

/** The GE scoring queue: every session waiting for a human score, org-scoped. */
export default async function HrScoringQueuePage() {
  const db = getDb();
  const ctx = await requireHrUser(db);
  const sessions = await listSessions(db, ctx, { status: "needs_ge_scoring" });

  return (
    <AppShell title="Antrean penilaian GE">
      <section className="overflow-x-auto rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
            Menunggu skor GE
          </h2>
          <p className="text-sm text-[var(--text-muted)]">{sessions.length} sesi</p>
        </div>
        {sessions.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-base)] p-6 text-sm leading-6 text-[var(--text-secondary)]">
            Tidak ada sesi yang menunggu penilaian GE. Sesi muncul di sini setelah peserta
            menyelesaikan seluruh subtes.
          </p>
        ) : (
          <table className="mt-6 min-w-full text-left">
            <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <tr>
                <th className="pb-3">Peserta</th>
                <th className="pb-3">Selesai tes</th>
                <th className="pb-3">Jawaban</th>
                <th className="pb-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="text-sm text-[var(--text-primary)]">
              {sessions.map((row) => (
                <tr key={row.sessionId} className="border-t border-[var(--border-subtle)]">
                  <td className="py-4 font-semibold">{row.candidateName}</td>
                  <td className="py-4">
                    {row.completedAt ? new Date(row.completedAt).toLocaleString("id-ID") : "—"}
                  </td>
                  <td className="py-4">{row.progress.answered} terjawab</td>
                  <td className="py-4">
                    <Link
                      href={`/hr/scoring/${row.sessionId}/ge`}
                      className="font-semibold text-[var(--accent-primary)]"
                    >
                      Nilai GE
                    </Link>
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
