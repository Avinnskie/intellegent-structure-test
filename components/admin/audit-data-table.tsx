"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { formatDateTime } from "@/lib/format-datetime";

export type AuditDataTableRow = {
  readonly id: number;
  readonly createdAt: string;
  readonly actorType: string;
  readonly actorId: string | null;
  readonly action: string;
  readonly objectType: string;
  readonly objectId: string | null;
  readonly metadataText: string | null;
};

const columnHelper = createColumnHelper<DataTableFeatures, AuditDataTableRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("createdAt", {
    header: "Waktu",
    cell: (info) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {formatDateTime(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("actorType", {
    header: "Aktor",
    cell: (info) => (
      <span className="inline-flex flex-col">
        <span className="font-semibold text-foreground">{info.getValue()}</span>
        {info.row.original.actorId ? (
          <span className="font-mono text-xs text-muted-foreground">
            {info.row.original.actorId}
          </span>
        ) : null}
      </span>
    ),
  }),
  columnHelper.accessor("action", {
    header: "Aksi",
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  columnHelper.accessor("objectType", {
    header: "Objek",
    cell: (info) => (
      <span className="inline-flex flex-col font-mono text-xs">
        {info.getValue()}
        {info.row.original.objectId ? (
          <span className="text-muted-foreground">{info.row.original.objectId}</span>
        ) : null}
      </span>
    ),
  }),
  columnHelper.accessor("metadataText", {
    header: "Metadata",
    cell: (info) =>
      info.getValue() ? (
        <pre className="max-w-md overflow-x-auto whitespace-pre-wrap rounded-lg bg-background p-3 font-mono text-xs leading-5 text-muted-foreground">
          {info.getValue()}
        </pre>
      ) : (
        "—"
      ),
  }),
]);

export function AuditDataTable({ rows }: { readonly rows: readonly AuditDataTableRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyMessage="Belum ada aktivitas tercatat."
      pagination={false}
      getRowId={(row) => String(row.id)}
      frameClassName="mt-6"
      cellClassName="align-top"
    />
  );
}
