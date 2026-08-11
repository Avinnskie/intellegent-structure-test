import Link from "next/link";
import { sessionStatusLabel } from "@/components/hr/session-status-label";
import { AppShell } from "@/components/ui/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { getDb } from "@/lib/db/client.ts";
import type { SessionStatus } from "@/lib/domain/session-state.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { getDashboardMetrics } from "@/lib/server/metrics.ts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowRight } from "lucide-react";

export default async function HrDashboardPage() {
  const db = getDb();
  const ctx = await requireHrUser(db);
  const metrics = await getDashboardMetrics(db, ctx);

  const cards = [
    {
      label: "Sesi bulan ini",
      value: String(metrics.createdThisMonth),
      detail: "Sejak tanggal 1",
    },
    {
      label: "Sedang berlangsung",
      value: String(metrics.active),
      detail: "Tutorial s.d. subtes terakhir",
    },
    { label: "Hasil final", value: String(metrics.finalized), detail: "Siap diekspor" },
  ];

  return (
    <AppShell
      title="Selamat datang di Dashboard"
      actions={
        <Link
          href="/hr/sessions/new"
          className="inline-flex h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Buat sesi baru
        </Link>
      }
    >
      <section className="space-y-8">
        <div className="grid gap-4 grid-cols-3">
          {cards.map((metric) => (
            <StatCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              detail={metric.detail}
            />
          ))}
        </div>

        <div>
          <article className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Sesi terbaru
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-foreground">
                  Aktivitas assessment terbaru
                </h2>
              </div>
              <Link
                href="/hr/sessions"
                className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
              >
                Semua sesi <ArrowRight size={14} />
              </Link>
            </div>
            {metrics.recentSessions.length === 0 ? (
              <p className="mt-6 rounded-xl border border-dashed border-border bg-background p-6 text-sm leading-6 text-muted-foreground">
                Belum ada sesi. Mulai dengan menambahkan peserta lalu membuat sesi tes.
              </p>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <Table className="min-w-full text-left">
                  <TableHeader className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    <TableRow>
                      <TableHead className="pb-3">Peserta</TableHead>
                      <TableHead className="pb-3">Status</TableHead>
                      <TableHead className="pb-3">Subtes</TableHead>
                      <TableHead className="pb-3">Progres</TableHead>
                      <TableHead className="pb-3">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-sm text-foreground">
                    {metrics.recentSessions.map((row) => (
                      <TableRow key={row.sessionId} className="border-t border-border">
                        <TableCell className="py-4 font-semibold">{row.candidateName}</TableCell>
                        <TableCell className="py-4">
                          {sessionStatusLabel(row.status as SessionStatus)}
                        </TableCell>
                        <TableCell className="py-4">{row.currentSubtestCode ?? "—"}</TableCell>
                        <TableCell className="py-4">
                          {row.progress.subtestsCompleted}/9 · {row.progress.answered} jawaban
                        </TableCell>
                        <TableCell className="py-4">
                          <Link
                            href={`/hr/sessions/${row.sessionId}`}
                            className="underline font-semibold text-primary"
                          >
                            Detail
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </article>
        </div>
      </section>
    </AppShell>
  );
}
