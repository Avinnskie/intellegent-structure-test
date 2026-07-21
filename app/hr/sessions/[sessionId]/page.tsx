import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessCodeActions } from "@/components/hr/access-code-actions";
import { accessCodeStatusLabel, sessionStatusLabel } from "@/components/hr/session-status-label";
import { AppShell } from "@/components/ui/app-shell";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ApiError } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { getSessionDetail } from "@/lib/server/hr.ts";

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString("id-ID") : "—";
}

/** Real session detail: candidate, code state + controls, and per-subtest progress. */
export default async function HrSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const db = getDb();
  const ctx = await requireHrUser(db);

  let detail;
  try {
    detail = await getSessionDetail(db, ctx, sessionId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const totalItems = detail.subtests.reduce((total, subtest) => total + subtest.itemCount, 0);
  const answered = detail.subtests.reduce(
    (total, subtest) => total + (subtest.attempt?.answered ?? 0),
    0,
  );
  const skipped = detail.subtests.reduce(
    (total, subtest) => total + (subtest.attempt?.skipped ?? 0),
    0,
  );
  const subtestsCompleted = detail.subtests.filter(
    (subtest) => subtest.attempt?.status === "completed",
  ).length;

  return (
    <AppShell title={`Detail sesi — ${detail.candidate.fullName}`}>
      <section className="space-y-4 pb-5">
        <div className="space-x-4 flex w-full">
          <article className="w-full rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-[var(--accent-warm-soft)] px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
                {sessionStatusLabel(detail.status)}
              </span>
              {detail.currentSubtestCode ? (
                <span className="inline-flex items-center rounded-full border border-[var(--border-default)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                  Subtes aktif: {detail.currentSubtestCode}
                </span>
              ) : null}
            </div>
            <dl className="mt-6 space-y-3 text-sm text-[var(--text-secondary)]">
              <div>
                <dt className="inline font-semibold text-[var(--text-primary)]">Peserta: </dt>
                <dd className="inline">{detail.candidate.fullName}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-[var(--text-primary)]">Tanggal lahir: </dt>
                <dd className="inline">{detail.candidate.birthDate}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-[var(--text-primary)]">Tujuan: </dt>
                <dd className="inline">{detail.candidate.testPurpose}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-[var(--text-primary)]">Dibuat: </dt>
                <dd className="inline">{formatDateTime(detail.createdAt)}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-[var(--text-primary)]">Mulai tes: </dt>
                <dd className="inline">{formatDateTime(detail.startedAt)}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-[var(--text-primary)]">Selesai tes: </dt>
                <dd className="inline">{formatDateTime(detail.completedAt)}</dd>
              </div>
            </dl>
          </article>

          <article className="w-full rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
            <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">
              Kode akses
            </h2>
            {detail.accessCode ? (
              <dl className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
                <div>
                  <dt className="inline font-semibold text-[var(--text-primary)]">Kode: </dt>
                  <dd className="inline font-mono">{detail.accessCode.masked}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-[var(--text-primary)]">Status: </dt>
                  <dd className="inline">{accessCodeStatusLabel(detail.accessCode.status)}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-[var(--text-primary)]">
                    Berlaku sampai:{" "}
                  </dt>
                  <dd className="inline">{formatDateTime(detail.accessCode.expiresAt)}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-[var(--text-primary)]">
                    Terakhir dipakai:{" "}
                  </dt>
                  <dd className="inline">{formatDateTime(detail.accessCode.lastUsedAt)}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-[var(--text-primary)]">
                    Kebijakan masuk:{" "}
                  </dt>
                  <dd className="inline">
                    {detail.reentryPolicy === "multi"
                      ? "Boleh masuk berulang selama tes berjalan"
                      : "Sekali pakai — masuk ulang butuh kode baru dari HR"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-[var(--text-secondary)]">Belum ada kode akses.</p>
            )}
            <div className="mt-5 border-t border-[var(--border-subtle)] pt-5">
              <AccessCodeActions
                sessionId={detail.sessionId}
                codeStatus={detail.accessCode?.status ?? null}
              />
            </div>
          </article>
        </div>

        <article className="space-y-5 rounded-2xl border border-[var(--border-default)] p-6">
          <ProgressBar label="Subtes selesai" value={subtestsCompleted} total={9} />
          <ProgressBar label="Jawaban terisi" value={answered} total={totalItems} />
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Terjawab", String(answered)],
              ["Dilewati", String(skipped)],
              ["Belum", String(totalItems - answered - skipped)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-4"
              >
                <p className="text-sm text-[var(--text-muted)]">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-4">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                <tr>
                  <th className="pb-2">Subtes</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Terjawab</th>
                  <th className="pb-2">Dilewati</th>
                  <th className="pb-2">Mulai</th>
                  <th className="pb-2">Selesai</th>
                </tr>
              </thead>
              <tbody className="text-[var(--text-primary)]">
                {detail.subtests.map((subtest) => (
                  <tr key={subtest.code} className="border-t border-[var(--border-subtle)]">
                    <td className="py-3 font-semibold">
                      {subtest.code}
                      <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                        {subtest.title}
                      </span>
                    </td>
                    <td className="py-3">
                      {subtest.attempt
                        ? subtest.attempt.status === "completed"
                          ? subtest.attempt.completionReason === "timeout"
                            ? "Selesai (waktu habis)"
                            : "Selesai"
                          : "Berjalan"
                        : "Belum dibuka"}
                    </td>
                    <td className="py-3">
                      {subtest.attempt ? `${subtest.attempt.answered}/${subtest.itemCount}` : "—"}
                    </td>
                    <td className="py-3">{subtest.attempt?.skipped ?? "—"}</td>
                    <td className="py-3">
                      {subtest.attempt
                        ? formatDateTime(subtest.attempt.startedAt).slice(0, 17)
                        : "—"}
                    </td>
                    <td className="py-3">
                      {subtest.attempt?.completedAt
                        ? formatDateTime(subtest.attempt.completedAt).slice(0, 17)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail.status === "needs_ge_scoring" ? (
            <Link
              href={`/hr/results/${detail.sessionId}`}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
            >
              Buka hasil otomatis
            </Link>
          ) : null}
        </article>
      </section>
    </AppShell>
  );
}
