"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { toPlainText } from "@/lib/domain/rich-text";
import type { TutorialVersionDto } from "@/lib/server/content";

type TutorialVersionsDataTableProps = {
  readonly versions: readonly TutorialVersionDto[];
  readonly isBusy: boolean;
  readonly onEdit: (version: TutorialVersionDto) => void;
  readonly onDelete: (version: TutorialVersionDto) => void;
};

const STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: "Draft",
  published: "Terbit",
  archived: "Arsip",
  in_review: "Direview",
  approved: "Disetujui",
  rejected: "Ditolak",
};

const columnHelper = createColumnHelper<DataTableFeatures, TutorialVersionDto>();

export function TutorialVersionsDataTable({
  versions,
  isBusy,
  onEdit,
  onDelete,
}: TutorialVersionsDataTableProps) {
  const columns = columnHelper.columns([
    columnHelper.accessor("version", {
      header: "Versi",
      cell: (info) => <span className="font-mono">v{info.getValue()}</span>,
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => (
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] ${
            info.getValue() === "published"
              ? "bg-accent text-primary"
              : info.getValue() === "draft"
                ? "bg-accent text-foreground"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {STATUS_LABELS[info.getValue()] ?? info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("textContent", {
      header: "Konten",
      cell: (info) => (
        <span className="block max-w-md whitespace-normal">
          <span className="line-clamp-2 text-muted-foreground">
            {toPlainText(info.getValue())}
          </span>
          {info.row.original.videoReference ? (
            <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">
              video: {info.row.original.videoReference}
            </span>
          ) : null}
        </span>
      ),
    }),
    columnHelper.accessor("effectiveDate", {
      header: "Efektif",
      cell: (info) => info.getValue() ?? "—",
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      cell: (info) => (
        <span className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onEdit(info.row.original)}
            className="font-semibold text-primary hover:underline disabled:opacity-50"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onDelete(info.row.original)}
            className="font-semibold text-destructive hover:underline disabled:opacity-50"
          >
            Hapus
          </button>
        </span>
      ),
    }),
  ]);

  return (
    <DataTable
      columns={columns}
      data={versions}
      emptyMessage="Belum ada tutorial untuk subtes ini."
      getRowId={(row) => row.id}
      className="mt-6"
      cellClassName="align-top"
    />
  );
}
