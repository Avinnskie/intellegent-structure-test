import { ScoringQueueDataTable } from "@/components/hr/scoring-queue-data-table";
import { AppShell } from "@/components/ui/app-shell";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { listSessions } from "@/lib/server/hr.ts";

export default async function HrScoringQueuePage() {
  const db = getDb();
  const ctx = await requireHrUser(db);
  const sessions = await listSessions(db, ctx, { status: "needs_ge_scoring" });

  return (
    <AppShell title="Antrean penilaian GE">
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
            Menunggu skor GE
          </h2>
          <p className="text-sm text-muted-foreground">{sessions.length} sesi</p>
        </div>
        {sessions.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-border bg-background p-6 text-sm leading-6 text-muted-foreground">
            Tidak ada sesi yang menunggu penilaian GE. Sesi muncul di sini setelah peserta
            menyelesaikan seluruh subtes.
          </p>
        ) : (
          <ScoringQueueDataTable rows={sessions} />
        )}
      </section>
    </AppShell>
  );
}
