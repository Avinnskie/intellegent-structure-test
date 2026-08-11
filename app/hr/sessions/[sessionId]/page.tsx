import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessCodeActions } from "@/components/hr/access-code-actions";
import { PapiAnswerSheet } from "@/components/hr/papi-answer-sheet";
import { accessCodeStatusLabel, sessionStatusLabel } from "@/components/hr/session-status-label";
import { AppShell } from "@/components/ui/app-shell";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ApiError } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { getSessionDetail } from "@/lib/server/hr.ts";
import { logError } from "@/lib/server/logger.ts";
import { getPapiAnswerSheet, type PapiAnswerSheetDto } from "@/lib/server/papi-result-read.ts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString("id-ID") : "—";
}

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

  // Lembar jawaban PAPI bersifat tambahan: kegagalan membacanya tidak boleh
  // menjatuhkan halaman detail sesi.
  let papiSheet: PapiAnswerSheetDto | null = null;
  try {
    papiSheet = await getPapiAnswerSheet(db, ctx, sessionId);
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 403 && error.status !== 404)) {
      logError("papi_answer_sheet_unavailable", { sessionId }, error);
    }
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
        <div className="space-x-4 space-y-4 md:flex w-full">
          <article className="w-full rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-foreground">
                {sessionStatusLabel(detail.status)}
              </span>
              {detail.currentSubtestCode ? (
                <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
                  Subtes aktif: {detail.currentSubtestCode}
                </span>
              ) : null}
            </div>
            <dl className="mt-6 space-y-3 text-sm text-muted-foreground">
              <div>
                <dt className="inline font-semibold text-foreground">Peserta: </dt>
                <dd className="inline">{detail.candidate.fullName}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-foreground">Tanggal lahir: </dt>
                <dd className="inline">{detail.candidate.birthDate}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-foreground">Tujuan: </dt>
                <dd className="inline">{detail.candidate.testPurpose}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-foreground">Dibuat: </dt>
                <dd className="inline">{formatDateTime(detail.createdAt)}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-foreground">Mulai tes: </dt>
                <dd className="inline">{formatDateTime(detail.startedAt)}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-foreground">Selesai tes: </dt>
                <dd className="inline">{formatDateTime(detail.completedAt)}</dd>
              </div>
            </dl>
          </article>

          <article className="w-full rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold tracking-[-0.02em] text-foreground">Kode akses</h2>
            {detail.accessCode ? (
              <dl className="mt-4 space-y-2 text-sm text-muted-foreground">
                <div>
                  <dt className="inline font-semibold text-foreground">Kode: </dt>
                  <dd className="inline font-mono">{detail.accessCode.code}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-foreground">Status: </dt>
                  <dd className="inline">{accessCodeStatusLabel(detail.accessCode.status)}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-foreground">Berlaku sampai: </dt>
                  <dd className="inline">{formatDateTime(detail.accessCode.expiresAt)}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-foreground">Terakhir dipakai: </dt>
                  <dd className="inline">{formatDateTime(detail.accessCode.lastUsedAt)}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-foreground">Kebijakan masuk: </dt>
                  <dd className="inline">
                    {detail.reentryPolicy === "multi"
                      ? "Boleh masuk berulang selama tes berjalan"
                      : "Sekali pakai — masuk ulang butuh kode baru dari HR"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Belum ada kode akses.</p>
            )}
            <div className="mt-5 border-t border-border pt-5">
              <AccessCodeActions
                sessionId={detail.sessionId}
                codeStatus={detail.accessCode?.status ?? null}
              />
            </div>
          </article>
        </div>

        <article className="space-y-5 rounded-xl border border-border p-6">
          <ProgressBar label="Subtes selesai" value={subtestsCompleted} total={9} />
          <ProgressBar label="Jawaban terisi" value={answered} total={totalItems} />
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Terjawab", String(answered)],
              ["Dilewati", String(skipped)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card p-4">
            <Table className="min-w-full text-left text-sm">
              <TableHeader className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                <TableRow>
                  <TableHead className="pb-2">Subtes</TableHead>
                  <TableHead className="pb-2">Status</TableHead>
                  <TableHead className="pb-2">Terjawab</TableHead>
                  <TableHead className="pb-2">Dilewati</TableHead>
                  <TableHead className="pb-2">Mulai</TableHead>
                  <TableHead className="pb-2">Selesai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-foreground">
                {detail.subtests.map((subtest) => (
                  <TableRow key={subtest.code} className="border-t border-border">
                    <TableCell className="py-3 font-semibold">
                      {subtest.code}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {subtest.title}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      {subtest.attempt
                        ? subtest.attempt.status === "completed"
                          ? subtest.attempt.completionReason === "timeout"
                            ? "Selesai (waktu habis)"
                            : "Selesai"
                          : "Berjalan"
                        : "Belum dibuka"}
                    </TableCell>
                    <TableCell className="py-3">
                      {subtest.attempt ? `${subtest.attempt.answered}/${subtest.itemCount}` : "—"}
                    </TableCell>
                    <TableCell className="py-3">{subtest.attempt?.skipped ?? "—"}</TableCell>
                    <TableCell className="py-3">
                      {subtest.attempt
                        ? formatDateTime(subtest.attempt.startedAt).slice(0, 17)
                        : "—"}
                    </TableCell>
                    <TableCell className="py-3">
                      {subtest.attempt?.completedAt
                        ? formatDateTime(subtest.attempt.completedAt).slice(0, 17)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {papiSheet ? <PapiAnswerSheet sheet={papiSheet} /> : null}

          {detail.status === "needs_ge_scoring" ? (
            <Link
              href={`/hr/results/${detail.sessionId}`}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Buka hasil otomatis
            </Link>
          ) : null}
        </article>
      </section>
    </AppShell>
  );
}
