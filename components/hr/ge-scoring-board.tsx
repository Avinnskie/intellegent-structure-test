"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GeScoringDataTable,
  type GeScoreDraft,
} from "@/components/hr/ge-scoring-data-table";
import type { GeItemDto, SaveGeScoresDto } from "@/lib/server/ge-scoring.ts";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Coba lagi.";

type GeScoringBoardProps = {
  readonly sessionId: string;
  readonly items: readonly GeItemDto[];
  readonly isSessionScorable: boolean;
};

export function GeScoringBoard({ sessionId, items, isSessionScorable }: GeScoringBoardProps) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, GeScoreDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const answered = useMemo(() => items.filter((item) => item.responseId !== null), [items]);
  const scoredOnServer = answered.filter((item) => item.score !== null).length;
  const pendingCount = Object.keys(drafts).length;
  const displayScored = Math.min(answered.length, scoredOnServer + pendingCount);

  function setDraft(item: GeItemDto, score: 0 | 1 | 2) {
    const responseId = item.responseId;
    if (!responseId) {
      return;
    }
    setDrafts((current) => ({
      ...current,
      [responseId]: {
        score,
        note: current[responseId]?.note ?? "",
        overrideReason: current[responseId]?.overrideReason ?? "",
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
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-accent p-5">
        <p className="text-sm font-semibold text-foreground">
          {displayScored} dari {answered.length} jawaban dinilai
          {items.length > answered.length
            ? ` · ${items.length - answered.length} soal tidak dijawab (otomatis 0 saat kalkulasi)`
            : ""}
        </p>
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={pendingCount === 0 || isSaving || !isSessionScorable}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Menyimpan…" : `Simpan ${pendingCount || ""} skor`.trim()}
        </button>
      </div>

      {!isSessionScorable ? (
        <p className="rounded-xl border border-[var(--color-amber-500, #f59e0b)]/40 bg-[color-mix(in_srgb,var(--color-amber-500, #f59e0b)_10%,white)] px-4 py-3 text-sm leading-6 text-foreground">
          Sesi ini tidak sedang menunggu penilaian GE, jadi skor tidak dapat disimpan.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--destructive)]/30 bg-[color-mix(in_srgb,var(--destructive)_8%,white)] px-4 py-3 text-sm leading-6 text-destructive"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-border bg-background px-4 py-3 text-sm leading-6 text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <GeScoringDataTable
        items={items}
        drafts={drafts}
        isSessionScorable={isSessionScorable}
        onScoreChange={setDraft}
        onDraftFieldChange={setDraftField}
      />
    </div>
  );
}
