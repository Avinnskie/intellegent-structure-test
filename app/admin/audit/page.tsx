import Link from "next/link";
import { desc, count } from "drizzle-orm";
import { AppShell } from "@/components/ui/app-shell";
import { ApiError } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { auditLogs } from "@/lib/db/schema.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format-datetime.ts";

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

  return (
    <AppShell title="Audit log">
      <section className="overflow-x-auto rounded-xl border border-border bg-card p-6">
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
          <Table className="mt-6 min-w-full text-left">
            <TableHeader className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <TableRow>
                <TableHead className="pb-3">Waktu</TableHead>
                <TableHead className="pb-3">Aktor</TableHead>
                <TableHead className="pb-3">Aksi</TableHead>
                <TableHead className="pb-3">Objek</TableHead>
                <TableHead className="pb-3">Metadata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-sm text-foreground">
              {rows.map((row) => (
                <TableRow key={row.id} className="border-t border-border align-top">
                  <TableCell className="py-4 whitespace-nowrap text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="font-semibold">{row.actorType}</span>
                    {row.actorId ? (
                      <span className="block font-mono text-xs text-muted-foreground">
                        {row.actorId}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="py-4 font-mono text-xs">{row.action}</TableCell>
                  <TableCell className="py-4 font-mono text-xs">
                    {row.objectType}
                    {row.objectId ? (
                      <span className="block text-muted-foreground">{row.objectId}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="py-4">
                    {row.metadata ? (
                      <pre className="max-w-md overflow-x-auto whitespace-pre-wrap rounded-lg bg-background p-3 font-mono text-xs leading-5 text-muted-foreground">
                        {JSON.stringify(row.metadata, null, 2)}
                      </pre>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
