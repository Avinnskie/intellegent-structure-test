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
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
            Cari peserta
            <input
              type="search"
              name="query"
              defaultValue={query ?? ""}
              placeholder="Nama peserta…"
              className="h-11 w-64 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-4 text-sm font-medium text-[var(--text-primary)]"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
            Status
            <select
              name="status"
              defaultValue={status ?? ""}
              className="h-11 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-4 text-sm font-medium text-[var(--text-primary)]"
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
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
          >
            Terapkan
          </button>
        </form>

        <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
              Daftar sesi
            </h2>
            <p className="text-sm text-[var(--text-muted)]">{sessions.length} sesi</p>
          </div>
          {sessions.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-base)] p-6 text-sm leading-6 text-[var(--text-secondary)]">
              Tidak ada sesi yang cocok. Buat sesi baru atau ubah filter.
            </p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  <tr>
                    <th className="pb-3">Peserta</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Kode</th>
                    <th className="pb-3">Progres</th>
                    <th className="pb-3">Dibuat</th>
                    <th className="pb-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {sessions.map((row) => (
                    <tr
                      key={row.sessionId}
                      className="border-t border-[var(--border-subtle)] text-[var(--text-primary)]"
                    >
                      <td className="py-4 font-semibold">{row.candidateName}</td>
                      <td className="py-4">{sessionStatusLabel(row.status as SessionStatus)}</td>
                      <td className="py-4">
                        {row.accessCode ? (
                          <span className="inline-flex flex-col">
                            <span className="font-mono">{row.accessCode.masked}</span>
                            <span className="text-xs text-[var(--text-muted)]">
                              {accessCodeStatusLabel(row.accessCode.status)}
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-4">
                        {row.progress.subtestsCompleted}/9 subtes · {row.progress.answered} jawaban
                      </td>
                      <td className="py-4">{row.createdAt.slice(0, 10)}</td>
                      <td className="py-4">
                        <SessionRowActions
                          sessionId={row.sessionId}
                          status={row.status}
                          candidateName={row.candidateName}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </AppShell>
  );
}
