import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { SessionDataTable } from "@/components/hr/session-data-table";
import { AppShell } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { getDb } from "@/lib/db/client.ts";
import { getDashboardMetrics } from "@/lib/server/metrics.ts";
import { requirePortalUser } from "@/lib/server/portal-guard.ts";

export default async function HrDashboardPage() {
  const db = getDb();
  const context = await requirePortalUser();
  const metrics = await getDashboardMetrics(db, context);

  const cards = [
    {
      label: "Sesi bulan ini",
      value: String(metrics.createdThisMonth),
      detail: "Sejak tanggal 1",
    },
    {
      label: "Sedang berlangsung",
      value: String(metrics.active),
      detail: "Tutorial hingga subtes terakhir",
    },
    { label: "Hasil final", value: String(metrics.finalized), detail: "Siap diekspor" },
  ];

  return (
    <AppShell
      title="Selamat datang di Dashboard"
      actions={
        <Button
          nativeButton={false}
          size="lg"
          className="h-11 px-4"
          render={<Link href="/hr/sessions/new" />}
        >
          <Plus data-icon="inline-start" />
          Buat sesi baru
        </Button>
      }
    >
      <section className="space-y-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {cards.map((metric) => (
            <StatCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              detail={metric.detail}
            />
          ))}
        </div>

        <article className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Sesi terbaru
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-foreground">
                Aktivitas assessment terbaru
              </h2>
            </div>
            <Button
              nativeButton={false}
              variant="link"
              className="w-fit px-0"
              render={<Link href="/hr/sessions" />}
            >
              Semua sesi
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>

          <div className="mt-6">
            <SessionDataTable initialRows={metrics.recentSessions} />
          </div>
        </article>
      </section>
    </AppShell>
  );
}
