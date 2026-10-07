"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { formatDateTime } from "@/lib/format-datetime";
import type { SessionListRow } from "@/lib/server/hr";

const columnHelper = createColumnHelper<DataTableFeatures, SessionListRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("candidateName", {
    header: "Peserta",
    cell: (info) => <span className="font-semibold">{info.getValue()}</span>,
  }),
  columnHelper.accessor("completedAt", {
    header: "Selesai tes",
    cell: (info) => formatDateTime(info.getValue()),
  }),
  columnHelper.display({
    id: "answered",
    header: "Jawaban",
    cell: (info) => `${info.row.original.progress.answered} terjawab`,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    cell: (info) => (
      <Link
        href={`/hr/scoring/${info.row.original.sessionId}/ge`}
        className="font-semibold text-primary"
      >
        Nilai GE
      </Link>
    ),
  }),
]);

export function ScoringQueueDataTable({ rows }: { readonly rows: readonly SessionListRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyMessage="Tidak ada sesi yang menunggu penilaian GE."
      getRowId={(row) => row.sessionId}
      className="mt-6"
    />
  );
}
