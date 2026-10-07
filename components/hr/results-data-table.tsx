"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { sessionStatusLabel } from "@/components/hr/session-status-label";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { formatDate } from "@/lib/format-datetime";
import type { SessionListRow } from "@/lib/server/hr";

const columnHelper = createColumnHelper<DataTableFeatures, SessionListRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("candidateName", {
    header: "Peserta",
    cell: (info) => <span className="font-semibold">{info.getValue()}</span>,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => sessionStatusLabel(info.getValue()),
  }),
  columnHelper.accessor("completedAt", {
    header: "Selesai tes",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    cell: (info) => (
      <span className="flex flex-wrap gap-4">
        <Link
          href={`/hr/results/${info.row.original.sessionId}`}
          className="font-semibold text-primary"
        >
          Hasil
        </Link>
        {info.row.original.status === "final" ? (
          <Link
            href={`/hr/reports/${info.row.original.sessionId}`}
            className="font-semibold text-primary"
          >
            Laporan
          </Link>
        ) : null}
      </span>
    ),
  }),
]);

export function ResultsDataTable({ rows }: { readonly rows: readonly SessionListRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyMessage="Belum ada sesi yang menyelesaikan tes."
      getRowId={(row) => row.sessionId}
      className="mt-6"
    />
  );
}
