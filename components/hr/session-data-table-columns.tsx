"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { SessionRowActions } from "@/components/hr/session-row-actions";
import { accessCodeStatusLabel, sessionStatusLabel } from "@/components/hr/session-status-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { formatDate } from "@/lib/format-datetime.ts";
import type { SessionListRow } from "@/lib/server/hr.ts";

const columnHelper = createColumnHelper<DataTableFeatures, SessionListRow>();

const participantColumn = columnHelper.accessor("candidateName", {
  header: ({ column }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      Peserta
      <ArrowUpDown data-icon="inline-end" />
    </Button>
  ),
  cell: (info) => <span className="font-semibold text-foreground">{info.getValue()}</span>,
  sortFn: "text",
  filterFn: "includesString",
});

const statusColumn = columnHelper.accessor("status", {
  header: "Status",
  cell: (info) => <Badge variant="outline">{sessionStatusLabel(info.getValue())}</Badge>,
  sortFn: "text",
  filterFn: "includesString",
});

const stageColumn = columnHelper.accessor("currentSubtestCode", {
  header: "Tahap",
  cell: (info) => {
    const code = info.getValue();
    const { status } = info.row.original;
    if (!code) {
      return sessionStatusLabel(status);
    }
    return status === "subtest_in_progress"
      ? `IST · ${code}`
      : `${sessionStatusLabel(status)} · ${code}`;
  },
  sortFn: "text",
});

const progressColumn = columnHelper.display({
  id: "progress",
  header: "Progres",
  cell: (info) => {
    const { answered, subtestsCompleted } = info.row.original.progress;
    return (
      <span className="text-muted-foreground">
        <span className="font-medium tabular-nums text-foreground">{subtestsCompleted}/9</span>{" "}
        subtes
        <span aria-hidden="true"> · </span>
        <span className="font-medium tabular-nums text-foreground">{answered}</span> jawaban
      </span>
    );
  },
});

const createdColumn = columnHelper.accessor("createdAt", {
  header: ({ column }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      Dibuat
      <ArrowUpDown data-icon="inline-end" />
    </Button>
  ),
  cell: (info) => formatDate(info.getValue()),
  sortFn: "text",
});

export const recentSessionColumns = columnHelper.columns([
  participantColumn,
  statusColumn,
  stageColumn,
  progressColumn,
  columnHelper.display({
    id: "detail",
    header: "Aksi",
    cell: (info) => (
      <Button
        nativeButton={false}
        variant="link"
        size="sm"
        className="h-auto px-0"
        render={<Link href={`/hr/sessions/${info.row.original.sessionId}`} />}
      >
        Buka detail
      </Button>
    ),
  }),
]);

export const managementSessionColumns = columnHelper.columns([
  participantColumn,
  statusColumn,
  stageColumn,
  columnHelper.display({
    id: "accessCode",
    header: "Kode akses",
    cell: (info) => {
      const accessCode = info.row.original.accessCode;
      return accessCode ? (
        <span className="inline-flex flex-col">
          <span className="font-mono font-medium">{accessCode.code}</span>
          <span className="text-xs text-muted-foreground">
            {accessCodeStatusLabel(accessCode.status)}
          </span>
        </span>
      ) : (
        "—"
      );
    },
  }),
  progressColumn,
  createdColumn,
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    cell: (info) => (
      <SessionRowActions
        sessionId={info.row.original.sessionId}
        status={info.row.original.status}
        candidateName={info.row.original.candidateName}
      />
    ),
  }),
]);
