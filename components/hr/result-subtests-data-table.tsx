"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { ResultDto } from "@/lib/server/calculate";

type ResultSubtestRow = ResultDto["subtests"][number];

const columnHelper = createColumnHelper<DataTableFeatures, ResultSubtestRow>();

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
  columnHelper.accessor("rawScore", { header: "RW" }),
  columnHelper.accessor("standardScore", { header: "SW" }),
  columnHelper.accessor("category", { header: "Kategori" }),
]);

export function ResultSubtestsDataTable({
  rows,
}: {
  readonly rows: ResultDto["subtests"];
}) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyMessage="Belum ada skor subtes."
      pagination={false}
      getRowId={(row) => row.code}
    />
  );
}
