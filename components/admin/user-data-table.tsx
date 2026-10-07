"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { formatDateTime } from "@/lib/format-datetime";
import type { PortalUserDto } from "@/lib/server/users";

type UserDataTableProps = {
  readonly users: readonly PortalUserDto[];
  readonly selfId: string;
  readonly isBusy: boolean;
  readonly onEdit: (user: PortalUserDto) => void;
  readonly onDeactivate: (user: PortalUserDto) => void;
  readonly onActivate: (user: PortalUserDto) => void;
};

const columnHelper = createColumnHelper<DataTableFeatures, PortalUserDto>();

export function UserDataTable({
  users,
  selfId,
  isBusy,
  onEdit,
  onDeactivate,
  onActivate,
}: UserDataTableProps) {
  const columns = columnHelper.columns([
    columnHelper.accessor("displayName", {
      header: "Nama",
      cell: (info) => (
        <span className="font-semibold">
          {info.getValue()}
          {info.row.original.id === selfId ? (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
              Anda
            </span>
          ) : null}
        </span>
      ),
    }),
    columnHelper.accessor("email", { header: "Email" }),
    columnHelper.accessor("role", {
      header: "Role",
      cell: (info) => (info.getValue() === "super_admin" ? "Super Admin" : "HR Admin"),
    }),
    columnHelper.display({
      id: "viewResults",
      header: "view_results",
      cell: (info) => (info.row.original.permissions.includes("view_results") ? "✓" : "—"),
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => (
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] ${
            info.getValue() === "active"
              ? "bg-accent text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {info.getValue() === "active" ? "Aktif" : "Nonaktif"}
        </span>
      ),
    }),
    columnHelper.accessor("lastLoginAt", {
      header: "Login terakhir",
      cell: (info) => formatDateTime(info.getValue()),
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      cell: (info) => {
        const user = info.row.original;
        return (
          <span className="flex flex-wrap gap-1">
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              disabled={isBusy}
              onClick={() => onEdit(user)}
            >
              Edit
            </Button>
            {user.id !== selfId ? (
              <Button
                variant="link"
                size="sm"
                className={`h-auto p-0 ${
                  user.status === "active" ? "text-destructive" : "text-muted-foreground"
                }`}
                disabled={isBusy}
                onClick={() =>
                  user.status === "active" ? onDeactivate(user) : onActivate(user)
                }
              >
                {user.status === "active" ? "Nonaktifkan" : "Aktifkan"}
              </Button>
            ) : null}
          </span>
        );
      },
    }),
  ]);

  return (
    <DataTable
      columns={columns}
      data={users}
      emptyMessage="Belum ada akun portal."
      getRowId={(row) => row.id}
      className="mt-6"
    />
  );
}
