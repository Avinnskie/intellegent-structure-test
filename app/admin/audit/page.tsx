import Link from "next/link";
import { desc, count } from "drizzle-orm";
import { AuditDataTable, type AuditDataTableRow } from "@/components/admin/audit-data-table";
import { AppShell } from "@/components/ui/app-shell";
import { ApiError } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { auditLogs } from "@/lib/db/schema.ts";
import { requireHrUser } from "@/lib/server/authz.ts";

const PAGE_SIZE = 50;
const FORBIDDEN_MESSAGE = "Anda tidak memiliki izin untuk tindakan ini.";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const db = getDb();
  const ctx = await requireHrUser(db);
  if (ctx.role !== "super_admin") {
    throw new ApiError("FORBIDDEN", FORBIDDEN_MESSAGE, 403);
  }

  const { page } = await searchParams;
  const parsedPage = Number.parseInt(page ?? "1", 10);
  const currentPage = Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const [totalRow] = await db.select({ total: count() }).from(auditLogs);
  const total = totalRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(PAGE_SIZE)
    .offset((currentPage - 1) * PAGE_SIZE);
  const tableRows: AuditDataTableRow[] = rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actorType: row.actorType,
    actorId: row.actorId,
    action: row.action,
    objectType: row.objectType,
    objectId: row.objectId,
    metadataText: row.metadata ? JSON.stringify(row.metadata, null, 2) : null,
  }));

  return (
    <AppShell title="Audit log">
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
            Aktivitas sistem
          </h2>
          <p className="text-sm text-muted-foreground">
            {total} entri · halaman {currentPage}/{totalPages}
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-border bg-background p-6 text-sm leading-6 text-muted-foreground">
            Belum ada aktivitas tercatat.
          </p>
        ) : (
          <AuditDataTable rows={tableRows} />
        )}

        <nav className="mt-6 flex items-center gap-3 border-t border-border pt-5">
          {currentPage > 1 ? (
            <Link
              href={`/admin/audit?page=${currentPage - 1}`}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted"
            >
              ← Lebih baru
            </Link>
          ) : null}
          {currentPage < totalPages ? (
            <Link
              href={`/admin/audit?page=${currentPage + 1}`}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Lebih lama →
            </Link>
          ) : null}
        </nav>
      </section>
    </AppShell>
  );
}
