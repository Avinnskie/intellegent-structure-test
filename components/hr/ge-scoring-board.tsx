"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PrototypeBadge } from "@/components/ui/prototype-badge";
import { geScoringRows } from "@/lib/ist-data";

type ScoreMap = Record<number, number>;

type GeScoringBoardProps = {
  readonly sessionId: string;
};

export function GeScoringBoard({ sessionId }: GeScoringBoardProps) {
  const router = useRouter();
  const [scores, setScores] = useState<ScoreMap>({});
  const [overrideReason, setOverrideReason] = useState("");

  const scoredCount = Object.keys(scores).length;
  const isComplete = scoredCount === geScoringRows.length;
  const totalScore = useMemo(
    () => Object.values(scores).reduce((sum, score) => sum + score, 0),
    [scores],
  );

  function handleScore(itemNumber: number, score: number) {
    setScores((current) => ({ ...current, [itemNumber]: score }));
  }

  function handleCalculate() {
    if (!isComplete) {
      return;
    }

    router.push(`/hr/results/${sessionId}`);
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]">
        <table className="min-w-full text-left">
          <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <tr>
              <th className="pb-3">Item</th>
              <th className="pb-3">Response</th>
              <th className="pb-3">Rubrik</th>
              <th className="pb-3">Skor</th>
            </tr>
          </thead>
          <tbody className="text-sm text-[var(--text-primary)]">
            {geScoringRows.map((row) => {
              const selectedScore = scores[row.itemNumber];

              return (
                <tr key={row.itemNumber} className="border-t border-[var(--border-subtle)]">
                  <td className="py-4 font-mono">{row.itemNumber}</td>
                  <td className="py-4">{row.response}</td>
                  <td className="py-4 text-[var(--text-secondary)]">{row.rubricHint}</td>
                  <td className="py-4">
                    <div
                      role="radiogroup"
                      aria-label={`Skor butir ${row.itemNumber}`}
                      className="flex gap-2"
                    >
                      {[0, 1, 2].map((score) => {
                        const selected = selectedScore === score;

                        return (
                          <button
                            key={score}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => handleScore(row.itemNumber, score)}
                            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
                              selected
                                ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                                : "border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                            }`}
                          >
                            {score}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
          <label
            htmlFor="override-reason"
            className="text-sm font-semibold text-[var(--text-primary)]"
          >
            Catatan / alasan override
          </label>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            Wajib diisi pada production flow ketika scorer mengubah skor yang sudah tersimpan. Actor
            dan timestamp ikut tercatat di audit log.
          </p>
          <textarea
            id="override-reason"
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            className="mt-4 min-h-24 w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-3 text-sm text-[var(--text-primary)]"
            placeholder="Contoh: jawaban butir 63 dinaikkan ke 2 setelah kalibrasi rubrik..."
          />
        </article>

        <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--accent-warm-soft)] p-6">
          <div className="flex flex-wrap items-center gap-3">
            <PrototypeBadge tone={isComplete ? "success" : "warning"}>
              {scoredCount}/{geScoringRows.length} dinilai
            </PrototypeBadge>
            <PrototypeBadge>Total skor demo: {totalScore}</PrototypeBadge>
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
            Hasil belum dapat dihitung sebelum seluruh butir GE memiliki skor. Setelah lengkap,
            calculate membawa Anda ke hasil demo.
          </p>
          <button
            type="button"
            onClick={handleCalculate}
            disabled={!isComplete}
            className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Simpan &amp; calculate demo
          </button>
        </article>
      </div>
    </div>
  );
}
