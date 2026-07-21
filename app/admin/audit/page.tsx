import Link from "next/link";
import { desc, count } from "drizzle-orm";
import { AppShell } from "@/components/ui/app-shell";
import { ApiError } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { auditLogs } from "@/lib/db/schema.ts";
import { requireHrUser } from "@/lib/server/authz.ts";

const PAGE_SIZE = 50;
const FORBIDDEN_MESSAGE = "Anda tidak memiliki izin untuk tindakan ini.";

/**
 * The real audit trail, newest first, paginated via `?page=`. Super_admin only — the layout gates
 * full loads, and the role is RE-CHECKED here because layouts do not re-run on client navigation.
 * Read-only by construction: this page has no actions, and the table has no update path anywhere.
 */
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
      <section className="overflow-x-auto rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
            Aktivitas sistem
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            {total} entri · halaman {currentPage}/{totalPages}
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-base)] p-6 text-sm leading-6 text-[var(--text-secondary)]">
            Belum ada aktivitas tercatat.
          </p>
        ) : (
          <table className="mt-6 min-w-full text-left">
            <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <tr>
                <th className="pb-3">Waktu</th>
                <th className="pb-3">Aktor</th>
                <th className="pb-3">Aksi</th>
                <th className="pb-3">Objek</th>
                <th className="pb-3">Metadata</th>
              </tr>
            </thead>
            <tbody className="text-sm text-[var(--text-primary)]">
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border-subtle)] align-top">
                  <td className="py-4 whitespace-nowrap text-[var(--text-secondary)]">
                    {row.createdAt.toLocaleString("id-ID")}
                  </td>
                  <td className="py-4">
                    <span className="font-semibold">{row.actorType}</span>
                    {row.actorId ? (
                      <span className="block font-mono text-xs text-[var(--text-muted)]">
                        {row.actorId}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-4 font-mono text-xs">{row.action}</td>
                  <td className="py-4 font-mono text-xs">
                    {row.objectType}
                    {row.objectId ? (
                      <span className="block text-[var(--text-muted)]">{row.objectId}</span>
                    ) : null}
                  </td>
                  <td className="py-4">
                    {row.metadata ? (
                      <pre className="max-w-md overflow-x-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-base)] p-3 font-mono text-xs leading-5 text-[var(--text-secondary)]">
                        {JSON.stringify(row.metadata, null, 2)}
                      </pre>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <nav className="mt-6 flex items-center gap-3 border-t border-[var(--border-subtle)] pt-5">
          {currentPage > 1 ? (
            <Link
              href={`/admin/audit?page=${currentPage - 1}`}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border-default)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
            >
              ← Lebih baru
            </Link>
          ) : null}
          {currentPage < totalPages ? (
            <Link
              href={`/admin/audit?page=${currentPage + 1}`}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border-default)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
            >
              Lebih lama →
            </Link>
          ) : null}
        </nav>
      </section>
    </AppShell>
  );
}
