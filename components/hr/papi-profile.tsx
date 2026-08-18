import { PapiRadar } from "@/components/hr/papi-radar";
import type { PapiResultDto } from "@/lib/server/papi-result-read.ts";
import {
  formatPapiElapsed,
  papiCategoryLabel,
  papiScoreBarPercent,
} from "@/lib/domain/papi-format.ts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format-datetime.ts";

const KIND_LABELS: Record<string, string> = {
  role: "Role",
  need: "Need",
};

function ScoreBar({ score }: { score: number }) {
  return (
    <span
      className="inline-flex h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-muted"
      aria-hidden="true"
    >
      <span
        className="h-full rounded-full bg-primary"
        style={{ width: `${papiScoreBarPercent(score)}%` }}
      />
    </span>
  );
}

export function PapiProfile({ result }: { result: PapiResultDto }) {
  const pendingCount = result.pendingInterpretationFactors.length;

  return (
    <section className="space-y-6">
      <article>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-[-0.02em] text-foreground">
              Profil kepribadian — PAPI Kostick
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Lama mengerjakan {formatPapiElapsed(result.elapsedSeconds)} · tanpa batas waktu
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
              Role {result.roleTotal}
            </span>
            <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
              Need {result.needTotal}
            </span>
            <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-bold text-foreground">
              Total {result.totalScore}
            </span>
          </div>
        </div>
      </article>

      <div className="grid gap-6 xl:grid-cols-2">
        <article>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Profil 20 faktor
          </p>
          <div className="mt-2">
            <PapiRadar factors={result.factors} />
          </div>
        </article>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {result.groups.map((group) => (
            <article key={group.code} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-bold text-foreground">{group.label}</h3>
                <span className="text-xs text-muted-foreground">rata-rata {group.average}</span>
              </div>

              <ul className="mt-3 space-y-2.5">
                {group.factors.map((factor) => (
                  <li key={factor.code} className="flex items-center gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">
                      {factor.code}
                    </span>
                    <ScoreBar score={factor.score} />
                    <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-foreground">
                      {factor.score}
                    </span>
                    <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">
                      {papiCategoryLabel(factor.category)}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <details className="rounded-xl border border-border bg-card p-6">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Tabel detail 20 faktor
        </summary>

        <div className="mt-5 overflow-x-auto">
          <Table className="min-w-full text-left">
            <TableHeader className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <TableRow>
                <TableHead className="pb-3">Faktor</TableHead>
                <TableHead className="pb-3">Tipe</TableHead>
                <TableHead className="pb-3">Skor</TableHead>
                <TableHead className="pb-3">Kategori</TableHead>
                <TableHead className="pb-3">Interpretasi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-sm text-foreground">
              {result.factors.map((factor) => (
                <TableRow key={factor.code} className="border-t border-border align-top">
                  <TableCell className="py-4 font-semibold">
                    {factor.code}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {factor.name}
                    </span>
                  </TableCell>
                  <TableCell className="py-4 text-xs text-muted-foreground">
                    {KIND_LABELS[factor.kind] ?? factor.kind}
                  </TableCell>
                  <TableCell className="py-4 tabular-nums">{factor.score}</TableCell>
                  <TableCell className="py-4">{papiCategoryLabel(factor.category)}</TableCell>
                  <TableCell className="py-4 text-sm leading-6 text-muted-foreground">
                    {factor.interpretation ?? (
                      <em className="text-muted-foreground">
                        Belum tersedia — menunggu narasi psikolog
                      </em>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
          Engine {result.engineVersion} · dihitung {formatDateTime(result.calculatedAt)}
        </p>
      </details>
    </section>
  );
}

export function PapiStageNotice({
  skipped,
  skipReason,
  sessionStatusLabel,
}: {
  readonly skipped: boolean;
  readonly skipReason: string | null;
  readonly sessionStatusLabel: string;
}) {
  const reasonText =
    skipReason === "participant_declined"
      ? "Peserta tidak melanjutkan ke kuesioner kepribadian."
      : skipReason === "hr_closed_early"
        ? "Sesi ditutup lebih awal oleh HR."
        : "Bagian PAPI tidak dikerjakan.";

  return (
    <article className="rounded-xl border border-dashed border-border bg-card p-6">
      <h2 className="text-sm font-bold text-foreground">PAPI Kostick</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {skipped ? (
          <>
            {reasonText} Skoring parsial sengaja tidak dilakukan — skor ipsatif hanya sah bila
            seluruh 90 nomor terisi.
          </>
        ) : (
          <>
            Peserta belum menyelesaikan bagian PAPI. Status sesi saat ini:{" "}
            <strong className="text-foreground">{sessionStatusLabel}</strong>. Kode akses masih
            berlaku sehingga peserta dapat melanjutkan kapan saja.
          </>
        )}
      </p>
    </article>
  );
}
