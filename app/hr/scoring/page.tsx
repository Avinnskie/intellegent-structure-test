import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { getDb } from "@/lib/db/client.ts";
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
import { formatDateTime } from "@/lib/format-datetime.ts";

export default async function HrScoringQueuePage() {
  const db = getDb();
  const ctx = await requireHrUser(db);
  const sessions = await listSessions(db, ctx, { status: "needs_ge_scoring" });

  return (
    <AppShell title="Antrean penilaian GE">
      <section className="overflow-x-auto rounded-xl border border-border bg-card p-6">
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
          <Table className="mt-6 min-w-full text-left">
            <TableHeader className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <TableRow>
                <TableHead className="pb-3">Peserta</TableHead>
                <TableHead className="pb-3">Selesai tes</TableHead>
                <TableHead className="pb-3">Jawaban</TableHead>
                <TableHead className="pb-3">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-sm text-foreground">
              {sessions.map((row) => (
                <TableRow key={row.sessionId} className="border-t border-border">
                  <TableCell className="py-4 font-semibold">{row.candidateName}</TableCell>
                  <TableCell className="py-4">
                    {formatDateTime(row.completedAt)}
                  </TableCell>
                  <TableCell className="py-4">{row.progress.answered} terjawab</TableCell>
                  <TableCell className="py-4">
                    <Link
                      href={`/hr/scoring/${row.sessionId}/ge`}
                      className="font-semibold text-primary"
                    >
                      Nilai GE
                    </Link>
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
