"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { CandidateRow } from "@/components/hr/participant-manager";
import { calculateExactAge } from "@/lib/domain/age";

type ParticipantDataTableProps = {
  readonly candidates: readonly CandidateRow[];
  readonly today: string;
  readonly isBusy: boolean;
  readonly onEdit: (candidate: CandidateRow) => void;
  readonly onDelete: (candidate: CandidateRow) => void;
};

const columnHelper = createColumnHelper<DataTableFeatures, CandidateRow>();

export function ParticipantDataTable({
  candidates,
  today,
  isBusy,
  onEdit,
  onDelete,
}: ParticipantDataTableProps) {
  const columns = columnHelper.columns([
    columnHelper.accessor("fullName", {
      header: "Nama",
      cell: (info) => <span className="font-semibold">{info.getValue()}</span>,
    }),
    columnHelper.accessor("birthDate", { header: "Tanggal lahir" }),
    columnHelper.display({
      id: "age",
      header: "Usia saat ini",
      cell: (info) => `${calculateExactAge(info.row.original.birthDate, today)} tahun`,
    }),
    columnHelper.accessor("testPurpose", { header: "Tujuan" }),
    columnHelper.accessor("createdAt", {
      header: "Terdaftar",
      cell: (info) => info.getValue().slice(0, 10),
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      cell: (info) => (
        <span className="flex flex-wrap gap-1">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            disabled={isBusy}
            onClick={() => onEdit(info.row.original)}
          >
            Edit
          </Button>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-destructive underline"
            disabled={isBusy}
            onClick={() => onDelete(info.row.original)}
          >
            Hapus
          </Button>
        </span>
      ),
    }),
  ]);

  return (
    <DataTable
      columns={columns}
      data={candidates}
      emptyMessage="Belum ada peserta."
      getRowId={(row) => row.id}
      className="mt-6"
    />
  );
}
