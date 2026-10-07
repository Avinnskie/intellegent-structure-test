"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowData,
  type SortingState,
  type Table as TanStackTable,
  type TableOptions,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dataTableFeatures, type DataTableFeatures } from "@/components/ui/data-table-features";
import { cn } from "@/lib/utils";

type DataTableProps<TData extends RowData> = {
  readonly columns: ColumnDef<DataTableFeatures, TData>[];
  readonly data: readonly TData[];
  readonly emptyMessage: string;
  readonly pageSize?: number;
  readonly pagination?: boolean;
  readonly getRowId?: TableOptions<DataTableFeatures, TData>["getRowId"];
  readonly toolbar?: (table: TanStackTable<DataTableFeatures, TData>) => ReactNode;
  readonly className?: string;
  readonly frameClassName?: string;
  readonly tableContainerClassName?: string;
  readonly tableClassName?: string;
  readonly headerClassName?: string;
  readonly rowClassName?: string;
  readonly headClassName?: string;
  readonly cellClassName?: string;
};

export function DataTable<TData extends RowData>({
  columns,
  data,
  emptyMessage,
  pageSize = 10,
  pagination = true,
  getRowId,
  toolbar,
  className,
  frameClassName,
  tableContainerClassName,
  tableClassName,
  headerClassName,
  rowClassName,
  headClassName,
  cellClassName,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    initialState: { pagination: { pageIndex: 0, pageSize } },
    autoResetPageIndex: false,
    manualPagination: !pagination,
    getRowId,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: { sorting, columnFilters },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();
  const pageIndex = table.state.pagination.pageIndex;

  useEffect(() => {
    if (!pagination) {
      return;
    }
    const lastPageIndex = Math.max(0, pageCount - 1);
    if (pageIndex > lastPageIndex) {
      table.setPageIndex(lastPageIndex);
    }
  }, [pageCount, pageIndex, pagination, table]);

  return (
    <div className={cn("space-y-4", className)}>
      {toolbar ? toolbar(table) : null}

      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-card",
          frameClassName,
        )}
      >
        <Table className={tableClassName} containerClassName={tableContainerClassName}>
          <TableHeader
            className={cn(
              "bg-muted/55 text-xs uppercase tracking-[0.08em] text-muted-foreground",
              headerClassName,
            )}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={cn("h-11 px-4", headClassName)}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className={rowClassName}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn("px-4 py-3.5", cellClassName)}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="h-28 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredCount} data · Halaman {pageCount === 0 ? 0 : pageIndex + 1} dari {pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft data-icon="inline-start" />
              Sebelumnya
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Berikutnya
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
