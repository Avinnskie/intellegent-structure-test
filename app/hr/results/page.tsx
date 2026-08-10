import Link from "next/link";
import { sessionStatusLabel } from "@/components/hr/session-status-label";
import { AppShell } from "@/components/ui/app-shell";
import { getDb } from "@/lib/db/client.ts";
import type { SessionStatus } from "@/lib/domain/session-state.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { listSessions } from "@/lib/server/hr.ts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
      <section className="overflow-x-auto rounded-xl border border-border bg-card p-6">
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
          <Table className="mt-6 min-w-full text-left">
            <TableHeader className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <TableRow>
                <TableHead className="pb-3">Peserta</TableHead>
                <TableHead className="pb-3">Status</TableHead>
                <TableHead className="pb-3">Selesai tes</TableHead>
                <TableHead className="pb-3">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-sm text-foreground">
              {sessions.map((row) => (
                <TableRow key={row.sessionId} className="border-t border-border">
                  <TableCell className="py-4 font-semibold">{row.candidateName}</TableCell>
                  <TableCell className="py-4">
                    {sessionStatusLabel(row.status as SessionStatus)}
                  </TableCell>
                  <TableCell className="py-4">
                    {row.completedAt ? new Date(row.completedAt).toLocaleDateString("id-ID") : "—"}
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="flex flex-wrap gap-4">
                      <Link
                        href={`/hr/results/${row.sessionId}`}
                        className="font-semibold text-primary"
                      >
                        Hasil
                      </Link>
                      {row.status === "final" ? (
                        <Link
                          href={`/hr/reports/${row.sessionId}`}
                          className="font-semibold text-primary"
                        >
                          Laporan
                        </Link>
                      ) : null}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </AppShell>
  );
}
