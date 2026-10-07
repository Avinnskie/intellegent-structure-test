"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { toPlainText } from "@/lib/domain/rich-text";
import type { QuestionBankItemDto } from "@/lib/server/content";

type QuestionBankDataTableProps = {
  readonly items: readonly QuestionBankItemDto[];
  readonly isBusy: boolean;
  readonly onEdit: (item: QuestionBankItemDto) => void;
  readonly onToggleStatus: (item: QuestionBankItemDto) => void;
};

const columnHelper = createColumnHelper<DataTableFeatures, QuestionBankItemDto>();

export function QuestionBankDataTable({
  items,
  isBusy,
  onEdit,
  onToggleStatus,
}: QuestionBankDataTableProps) {
  const columns = columnHelper.columns([
    columnHelper.accessor("localNumber", {
      header: "No",
      cell: (info) => (
        <span className="font-mono">
          {info.getValue()}
          <span className="block text-xs text-muted-foreground">
            #{info.row.original.itemNumber}
          </span>
        </span>
      ),
    }),
    columnHelper.accessor("itemType", { header: "Tipe" }),
    columnHelper.accessor("prompt", {
      header: "Pertanyaan",
      cell: (info) => (
        <span className="line-clamp-2 max-w-md whitespace-normal text-muted-foreground">
          {toPlainText(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor("mediaReference", {
      header: "Media",
      cell: (info) => (
        <span className="block max-w-48 truncate" title={info.getValue() ?? undefined}>
          {info.getValue() ?? "—"}
        </span>
      ),
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => (
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] ${
            info.getValue() === "active"
              ? "bg-accent text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {info.getValue() === "active" ? "Aktif" : "Nonaktif"}
        </span>
      ),
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
            onClick={() => onToggleStatus(info.row.original)}
            className="font-semibold text-muted-foreground hover:underline disabled:opacity-50"
          >
            {info.row.original.status === "active" ? "Nonaktifkan" : "Aktifkan"}
          </button>
        </span>
      ),
    }),
  ]);

  return (
    <DataTable
      columns={columns}
      data={items}
      emptyMessage="Belum ada soal untuk subtes ini."
      getRowId={(row) => row.itemVersionId}
      className="mt-6"
      cellClassName="align-top"
    />
  );
}
