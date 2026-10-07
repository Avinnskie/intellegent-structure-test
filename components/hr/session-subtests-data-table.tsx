"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { formatDateTime } from "@/lib/format-datetime";
import type { SessionDetailDto } from "@/lib/server/hr";

type SessionSubtestRow = SessionDetailDto["subtests"][number];

const columnHelper = createColumnHelper<DataTableFeatures, SessionSubtestRow>();

function attemptStatus(row: SessionSubtestRow): string {
  if (!row.attempt) return "Belum dibuka";
  if (row.attempt.status !== "completed") return "Berjalan";
  return row.attempt.completionReason === "timeout" ? "Selesai (waktu habis)" : "Selesai";
}

const columns = columnHelper.columns([
  columnHelper.accessor("code", {
    header: "Subtes",
    cell: (info) => (
      <span className="font-semibold">
        {info.getValue()}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {info.row.original.title}
        </span>
      </span>
    ),
  }),
  columnHelper.display({
    id: "status",
    header: "Status",
    cell: (info) => attemptStatus(info.row.original),
  }),
  columnHelper.display({
    id: "answered",
    header: "Terjawab",
    cell: (info) => {
      const { attempt, itemCount } = info.row.original;
      return attempt ? `${attempt.answered}/${itemCount}` : "—";
    },
  }),
  columnHelper.display({
    id: "skipped",
    header: "Dilewati",
    cell: (info) => info.row.original.attempt?.skipped ?? "—",
  }),
  columnHelper.display({
    id: "startedAt",
    header: "Mulai",
    cell: (info) => {
      const startedAt = info.row.original.attempt?.startedAt;
      return startedAt ? formatDateTime(startedAt).slice(0, 17) : "—";
    },
  }),
  columnHelper.display({
    id: "completedAt",
    header: "Selesai",
    cell: (info) => {
      const completedAt = info.row.original.attempt?.completedAt;
      return completedAt ? formatDateTime(completedAt).slice(0, 17) : "—";
    },
  }),
]);

export function SessionSubtestsDataTable({ rows }: { readonly rows: SessionDetailDto["subtests"] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyMessage="Belum ada subtes dalam sesi ini."
      pagination={false}
      getRowId={(row) => row.code}
    />
  );
}
