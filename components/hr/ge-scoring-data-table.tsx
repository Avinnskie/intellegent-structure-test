"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { GeItemDto } from "@/lib/server/ge-scoring";

export type GeScoreDraft = {
  readonly score: 0 | 1 | 2;
  readonly note: string;
  readonly overrideReason: string;
};

type GeScoringDataTableProps = {
  readonly items: readonly GeItemDto[];
  readonly drafts: Readonly<Record<string, GeScoreDraft>>;
  readonly isSessionScorable: boolean;
  readonly onScoreChange: (item: GeItemDto, score: 0 | 1 | 2) => void;
  readonly onDraftFieldChange: (
    responseId: string,
    field: "note" | "overrideReason",
    value: string,
  ) => void;
};

const columnHelper = createColumnHelper<DataTableFeatures, GeItemDto>();

export function GeScoringDataTable({
  items,
  drafts,
  isSessionScorable,
  onScoreChange,
  onDraftFieldChange,
}: GeScoringDataTableProps) {
  const columns = columnHelper.columns([
    columnHelper.accessor("localNumber", {
      header: "No",
      cell: (info) => <span className="font-mono">{info.getValue()}</span>,
    }),
    columnHelper.accessor("prompt", {
      header: "Soal",
      cell: (info) => (
        <span className="block max-w-56 whitespace-normal text-muted-foreground">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("responseValue", {
      header: "Jawaban peserta",
      cell: (info) =>
        info.getValue() !== null ? (
          <span className="block max-w-64 whitespace-pre-wrap">{info.getValue()}</span>
        ) : (
          <span className="italic text-muted-foreground">
            {info.row.original.responseStatus === "skipped" ? "Dilewati" : "Tidak dijawab"}
          </span>
        ),
    }),
    columnHelper.accessor("rubric", {
      header: "Rubrik",
      cell: (info) => (
        <span className="block max-w-56 whitespace-normal text-xs leading-5 text-muted-foreground">
          {info.getValue() ?? "—"}
        </span>
      ),
    }),
    columnHelper.display({
      id: "score",
      header: "Skor",
      cell: (info) => {
        const item = info.row.original;
        const responseId = item.responseId;
        if (!responseId) return <span className="text-muted-foreground">—</span>;
        const effectiveScore = drafts[responseId]?.score ?? item.score;
        return (
          <div className="flex gap-2" role="group" aria-label={`Skor butir ${item.localNumber}`}>
            {([0, 1, 2] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onScoreChange(item, value)}
                disabled={!isSessionScorable}
                aria-pressed={effectiveScore === value}
                className={`inline-flex size-10 items-center justify-center rounded-xl border text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${
                  effectiveScore === value
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border text-foreground hover:bg-muted"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "notes",
      header: "Catatan / alasan override",
      cell: (info) => {
        const item = info.row.original;
        const responseId = item.responseId;
        const draft = responseId ? drafts[responseId] : undefined;
        const isOverriding = draft && item.score !== null && draft.score !== item.score;
        if (!responseId || !draft) {
          return item.scoreNote ? (
            <span className="text-xs text-muted-foreground">{item.scoreNote}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        }
        return (
          <div className="grid w-56 gap-2">
            <input
              type="text"
              value={draft.note}
              onChange={(event) => onDraftFieldChange(responseId, "note", event.target.value)}
              placeholder="Catatan (opsional)"
              maxLength={500}
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs"
            />
            {isOverriding ? (
              <input
                type="text"
                value={draft.overrideReason}
                onChange={(event) =>
                  onDraftFieldChange(responseId, "overrideReason", event.target.value)
                }
                placeholder="WAJIB: alasan mengubah skor tercatat"
                maxLength={500}
                className="h-9 rounded-lg border border-border bg-muted/40 px-3 text-xs"
              />
            ) : null}
          </div>
        );
      },
    }),
  ]);

  return (
    <DataTable
      columns={columns}
      data={items}
      emptyMessage="Tidak ada butir GE untuk dinilai."
      pagination={false}
      getRowId={(row) => row.itemVersionId}
      rowClassName="align-top"
      cellClassName="align-top whitespace-normal"
    />
  );
}
