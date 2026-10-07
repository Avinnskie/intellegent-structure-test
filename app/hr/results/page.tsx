import { ResultsDataTable } from "@/components/hr/results-data-table";
import { AppShell } from "@/components/ui/app-shell";
import { getDb } from "@/lib/db/client.ts";
import type { SessionStatus } from "@/lib/domain/session-state.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { listSessions } from "@/lib/server/hr.ts";

const RESULT_STATUSES: ReadonlySet<SessionStatus> = new Set([
  "test_completed",
  "needs_ge_scoring",
  "calculated",
  "reviewed",
  "final",
  "needs_review",
]);

export default async function HrResultsListPage() {
  const db = getDb();
  const ctx = await requireHrUser(db);
  const sessions = (await listSessions(db, ctx)).filter((row) =>
    RESULT_STATUSES.has(row.status as SessionStatus),
  );

  return (
    <AppShell title="Hasil & laporan">
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
            Sesi selesai tes
          </h2>
          <p className="text-sm text-muted-foreground">{sessions.length} sesi</p>
        </div>
        {sessions.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-border bg-background p-6 text-sm leading-6 text-muted-foreground">
            Belum ada sesi yang menyelesaikan tes. Setelah peserta selesai, seluruh subtes termasuk
            GE dinilai dari kunci jawaban dan hasil dihitung otomatis untuk finalisasi HR.
          </p>
        ) : (
          <ResultsDataTable rows={sessions} />
        )}
      </section>
    </AppShell>
  );
}
