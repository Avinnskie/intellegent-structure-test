"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { papiCategoryLabel } from "@/lib/domain/papi-format";
import type { PapiFactorRow } from "@/lib/server/papi-result-read";

const KIND_LABELS: Readonly<Record<string, string>> = {
  role: "Role",
  need: "Need",
};

const columnHelper = createColumnHelper<DataTableFeatures, PapiFactorRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("code", {
    header: "Faktor",
    cell: (info) => (
      <span className="font-semibold">
        {info.getValue()}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {info.row.original.name}
        </span>
      </span>
    ),
  }),
  columnHelper.accessor("kind", {
    header: "Tipe",
    cell: (info) => (
      <span className="text-xs text-muted-foreground">
        {KIND_LABELS[info.getValue()] ?? info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("score", {
    header: "Skor",
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("category", {
    header: "Kategori",
    cell: (info) => papiCategoryLabel(info.getValue()),
  }),
  columnHelper.accessor("interpretation", {
    header: "Interpretasi",
    cell: (info) => (
      <span className="block max-w-xl whitespace-normal text-sm leading-6 text-muted-foreground">
        {info.getValue() ?? (
          <em className="text-muted-foreground">
            Belum tersedia — menunggu narasi psikolog
          </em>
        )}
      </span>
    ),
  }),
]);

export function PapiFactorsDataTable({
  factors,
}: {
  readonly factors: readonly PapiFactorRow[];
}) {
  return (
    <DataTable
      columns={columns}
      data={factors}
      emptyMessage="Belum ada faktor PAPI."
      pagination={false}
      getRowId={(row) => row.code}
      cellClassName="align-top"
    />
  );
}
