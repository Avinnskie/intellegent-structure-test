"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GeItemDto, SaveGeScoresDto } from "@/lib/server/ge-scoring.ts";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Coba lagi.";

type Draft = { score: 0 | 1 | 2; note: string; overrideReason: string };

type GeScoringBoardProps = {
  readonly sessionId: string;
  readonly items: readonly GeItemDto[];
  readonly isSessionScorable: boolean;
};

/**
 * The GE rubric board on real data. Answered items get 0/1/2 buttons; unanswered items are shown
 * but not scorable — their absence is auto-scored 0 by the calculation pipeline. Changing a score
 * that already exists demands an override reason (audited server-side).
 */
export function GeScoringBoard({ sessionId, items, isSessionScorable }: GeScoringBoardProps) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const answered = useMemo(() => items.filter((item) => item.responseId !== null), [items]);
  const scoredOnServer = answered.filter((item) => item.score !== null).length;
  const pendingCount = Object.keys(drafts).length;
  const displayScored = Math.min(answered.length, scoredOnServer + pendingCount);

  function setDraft(item: GeItemDto, score: 0 | 1 | 2) {
    if (!item.responseId) {
      return;
    }
    setDrafts((current) => ({
      ...current,
      [item.responseId as string]: {
        score,
        note: current[item.responseId as string]?.note ?? "",
        overrideReason: current[item.responseId as string]?.overrideReason ?? "",
      },
    }));
  }

  function setDraftField(responseId: string, field: "note" | "overrideReason", value: string) {
    setDrafts((current) => {
      const draft = current[responseId];
      if (!draft) {
        return current;
      }
      return { ...current, [responseId]: { ...draft, [field]: value } };
    });
  }

  async function handleSaveAll() {
    if (pendingCount === 0 || isSaving) {
      return;
    }
    setIsSaving(true);
    setError(null);
    setNotice(null);

    const scores = Object.entries(drafts).map(([responseId, draft]) => ({
      responseId,
      score: draft.score,
      ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      ...(draft.overrideReason.trim() ? { overrideReason: draft.overrideReason.trim() } : {}),
    }));

    try {
      const response = await fetch(`/api/hr/sessions/${sessionId}/ge-scores`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scores }),
      });
      if (response.ok) {
        const dto: SaveGeScoresDto = await response.json();
        setDrafts({});
        if (dto.isComplete) {
          router.push(`/hr/results/${sessionId}`);
          return;
        }
        setNotice(
          `${dto.saved} skor tersimpan${dto.overridden ? `, ${dto.overridden} di-override` : ""}.`,
        );
        router.refresh();
        return;
      }
      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      setError(envelope.error?.message ?? NETWORK_ERROR_MESSAGE);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border-default)] bg-[var(--accent-soft)] p-5">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          {displayScored} dari {answered.length} jawaban dinilai
          {items.length > answered.length
            ? ` · ${items.length - answered.length} soal tidak dijawab (otomatis 0 saat kalkulasi)`
            : ""}
        </p>
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={pendingCount === 0 || isSaving || !isSessionScorable}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Menyimpan…" : `Simpan ${pendingCount || ""} skor`.trim()}
        </button>
      </div>

      {!isSessionScorable ? (
        <p className="rounded-xl border border-[var(--status-warning)]/40 bg-[color-mix(in_srgb,var(--status-warning)_10%,white)] px-4 py-3 text-sm leading-6 text-[var(--text-primary)]">
          Sesi ini tidak sedang menunggu penilaian GE, jadi skor tidak dapat disimpan.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--status-error)]/30 bg-[color-mix(in_srgb,var(--status-error)_8%,white)] px-4 py-3 text-sm leading-6 text-[var(--status-error)]"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
          {notice}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
        <table className="min-w-full text-left">
          <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <tr>
              <th className="pb-3">No</th>
              <th className="pb-3">Soal</th>
              <th className="pb-3">Jawaban peserta</th>
              <th className="pb-3">Rubrik</th>
              <th className="pb-3">Skor</th>
              <th className="pb-3">Catatan / alasan override</th>
            </tr>
          </thead>
          <tbody className="text-sm text-[var(--text-primary)]">
            {items.map((item) => {
              const draft = item.responseId ? drafts[item.responseId] : undefined;
              const effectiveScore = draft?.score ?? item.score;
              const isOverriding =
                draft !== undefined && item.score !== null && draft.score !== item.score;

              return (
                <tr
                  key={item.itemVersionId}
                  className="border-t border-[var(--border-subtle)] align-top"
                >
                  <td className="py-4 font-mono">{item.localNumber}</td>
                  <td className="max-w-56 py-4 text-[var(--text-secondary)]">{item.prompt}</td>
                  <td className="max-w-64 py-4">
                    {item.responseValue !== null ? (
                      <span className="whitespace-pre-wrap">{item.responseValue}</span>
                    ) : (
                      <span className="italic text-[var(--text-muted)]">
                        {item.responseStatus === "skipped" ? "Dilewati" : "Tidak dijawab"}
                      </span>
                    )}
                  </td>
                  <td className="max-w-56 py-4 text-xs leading-5 text-[var(--text-secondary)]">
                    {item.rubric ?? "—"}
                  </td>
                  <td className="py-4">
                    {item.responseId ? (
                      <div
                        className="flex gap-2"
                        role="group"
                        aria-label={`Skor butir ${item.localNumber}`}
                      >
                        {([0, 1, 2] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setDraft(item, value)}
                            disabled={!isSessionScorable}
                            aria-pressed={effectiveScore === value}
                            className={`inline-flex size-10 items-center justify-center rounded-xl border text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${
                              effectiveScore === value
                                ? "border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white"
                                : "border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                            }`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  <td className="py-4">
                    {item.responseId && draft ? (
                      <div className="grid w-56 gap-2">
                        <input
                          type="text"
                          value={draft.note}
                          onChange={(event) =>
                            setDraftField(item.responseId as string, "note", event.target.value)
                          }
                          placeholder="Catatan (opsional)"
                          maxLength={500}
                          className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] px-3 text-xs"
                        />
                        {isOverriding ? (
                          <input
                            type="text"
                            value={draft.overrideReason}
                            onChange={(event) =>
                              setDraftField(
                                item.responseId as string,
                                "overrideReason",
                                event.target.value,
                              )
                            }
                            placeholder="WAJIB: alasan mengubah skor tercatat"
                            maxLength={500}
                            className="h-9 rounded-lg border border-[var(--status-warning)] bg-[var(--surface-base)] px-3 text-xs"
                          />
                        ) : null}
                      </div>
                    ) : item.scoreNote ? (
                      <span className="text-xs text-[var(--text-secondary)]">{item.scoreNote}</span>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
