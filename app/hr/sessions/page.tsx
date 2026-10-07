import { SessionBulkModal } from "@/components/hr/session-bulk-modal";
import { SessionCreateModal } from "@/components/hr/session-create-modal";
import { SessionDataTable } from "@/components/hr/session-data-table";
import { AppShell } from "@/components/ui/app-shell";
import { getDb } from "@/lib/db/client.ts";
import { listCandidates, listSessions } from "@/lib/server/hr.ts";
import { requirePortalUser } from "@/lib/server/portal-guard.ts";

export default async function HrSessionsPage() {
  const db = getDb();
  const context = await requirePortalUser();
  const [sessions, candidates] = await Promise.all([
    listSessions(db, context),
    listCandidates(db, context),
  ]);

  return (
    <AppShell
      title="Sesi tes"
      actions={
        <div className="flex flex-wrap gap-3">
          <SessionBulkModal />
          <SessionCreateModal
            candidates={candidates.map((candidate) => ({
              id: candidate.id,
              fullName: candidate.fullName,
              birthDate: candidate.birthDate,
            }))}
          />
        </div>
      }
    >
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Monitoring assessment
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-[-0.03em] text-foreground">
              Daftar sesi
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Tahap dan progres diperbarui otomatis tanpa refresh halaman.
          </p>
        </div>

        <SessionDataTable initialRows={sessions} manage />
      </section>
    </AppShell>
  );
}
