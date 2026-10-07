"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";

export type BulkCreatedRow = {
  readonly fullName: string;
  readonly birthDate: string;
  readonly accessCode: string;
  readonly accessCodeMasked: string;
};

const columnHelper = createColumnHelper<DataTableFeatures, BulkCreatedRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("fullName", {
    header: "Nama",
    cell: (info) => <span className="font-semibold">{info.getValue()}</span>,
  }),
  columnHelper.accessor("birthDate", { header: "Tanggal lahir" }),
  columnHelper.accessor("accessCode", {
    header: "Kode akses",
    cell: (info) => <span className="font-mono font-bold">{info.getValue()}</span>,
  }),
]);

export function SessionBulkCreatedDataTable({
  rows,
}: {
  readonly rows: readonly BulkCreatedRow[];
}) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyMessage="Tidak ada sesi yang dibuat."
      pagination={false}
      getRowId={(row) => `${row.accessCodeMasked}-${row.fullName}`}
      tableContainerClassName="max-h-80 overflow-x-hidden overflow-y-auto"
      tableClassName="table-fixed"
      headerClassName="sticky top-0 z-10 bg-muted"
      cellClassName="whitespace-normal break-words [overflow-wrap:anywhere]"
    />
  );
}
