"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { formatDateTime } from "@/lib/format-datetime";
import type { ReportHistoryRow } from "@/lib/server/reports";

const columnHelper = createColumnHelper<DataTableFeatures, ReportHistoryRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("reportVersion", {
    header: "Versi",
    cell: (info) => <span className="font-semibold">v{info.getValue()}</span>,
  }),
  columnHelper.accessor("fileHash", {
    header: "SHA-256",
    cell: (info) => <span className="font-mono text-xs">{info.getValue().slice(0, 16)}…</span>,
  }),
  columnHelper.accessor("generatedAt", {
    header: "Dibuat",
    cell: (info) => formatDateTime(info.getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    cell: (info) => (
      <a
        href={`/api/hr/results/${info.row.original.reportId}/report`}
        className="font-semibold text-primary hover:underline"
      >
        Unduh
      </a>
    ),
  }),
]);

export function ReportHistoryDataTable({ rows }: { readonly rows: readonly ReportHistoryRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyMessage="Belum ada PDF yang dibuat untuk hasil ini."
      pagination={false}
      getRowId={(row) => row.reportId}
      frameClassName="mt-4"
    />
  );
}
