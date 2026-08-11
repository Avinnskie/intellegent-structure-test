import { AppShell } from "@/components/ui/app-shell";
import { SessionBulkModal } from "@/components/hr/session-bulk-modal";
import { SessionCreateModal } from "@/components/hr/session-create-modal";
import { SessionRowActions } from "@/components/hr/session-row-actions";
import {
  accessCodeStatusLabel,
  sessionStatusLabel,
  SESSION_STATUS_LABELS,
} from "@/components/hr/session-status-label";
import { getDb } from "@/lib/db/client.ts";
import type { SessionStatus } from "@/lib/domain/session-state.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { listCandidates, listSessions } from "@/lib/server/hr.ts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function HrSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; query?: string }>;
}) {
  const { status, query } = await searchParams;
  const db = getDb();
  const ctx = await requireHrUser(db);
  const sessions = await listSessions(db, ctx, {
    status: status || undefined,
    query: query || undefined,
  });
  const candidates = await listCandidates(db, ctx);

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
      <section className="flex flex-col gap-6">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <label className="grid gap-2 text-sm font-semibold text-foreground">
            Cari peserta
            <input
              type="search"
              name="query"
              defaultValue={query ?? ""}
              placeholder="Nama peserta…"
              className="h-11 w-64 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-foreground">
            Status
            <select
              name="status"
              defaultValue={status ?? ""}
              className="h-11 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground"
            >
              <option value="">Semua status</option>
              {Object.entries(SESSION_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Terapkan
          </button>
        </form>

        <article className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">Daftar sesi</h2>
            <p className="text-sm text-muted-foreground">{sessions.length} sesi</p>
          </div>
          {sessions.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-border bg-background p-6 text-sm leading-6 text-muted-foreground">
              Tidak ada sesi yang cocok. Buat sesi baru atau ubah filter.
            </p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <Table className="min-w-full text-left">
                <TableHeader className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  <TableRow>
                    <TableHead className="pb-3">Peserta</TableHead>
                    <TableHead className="pb-3">Status</TableHead>
                    <TableHead className="pb-3">Kode</TableHead>
                    <TableHead className="pb-3">Progres</TableHead>
                    <TableHead className="pb-3">Dibuat</TableHead>
                    <TableHead className="pb-3">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-sm">
                  {sessions.map((row) => (
                    <TableRow
                      key={row.sessionId}
                      className="border-t border-border text-foreground"
                    >
                      <TableCell className="py-4 font-semibold">{row.candidateName}</TableCell>
                      <TableCell className="py-4">
                        {sessionStatusLabel(row.status as SessionStatus)}
                      </TableCell>
                      <TableCell className="py-4">
                        {row.accessCode ? (
                          <span className="inline-flex flex-col">
                            <span className="font-mono">{row.accessCode.code}</span>
                            <span className="text-xs text-muted-foreground">
                              {accessCodeStatusLabel(row.accessCode.status)}
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="py-4">
                        {row.progress.subtestsCompleted}/9 subtes · {row.progress.answered} jawaban
                      </TableCell>
                      <TableCell className="py-4">{row.createdAt.slice(0, 10)}</TableCell>
                      <TableCell className="py-4">
                        <SessionRowActions
                          sessionId={row.sessionId}
                          status={row.status}
                          candidateName={row.candidateName}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </article>
      </section>
    </AppShell>
  );
}
