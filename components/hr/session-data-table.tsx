"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Radio } from "lucide-react";
import { z } from "zod";
import { SESSION_STATUS_LABELS } from "@/components/hr/session-status-label";
import {
  managementSessionColumns,
  recentSessionColumns,
} from "@/components/hr/session-data-table-columns";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SESSION_STATUSES } from "@/lib/domain/session-state.ts";
import { SUBTEST_CODES } from "@/lib/ist-subtests.ts";
import { formatTime } from "@/lib/format-datetime.ts";
import type { SessionListRow } from "@/lib/server/hr.ts";

const ALL_SESSION_STATUSES = "__all__";

const sessionListSchema = z.array(
  z.object({
    sessionId: z.uuid(),
    candidateId: z.uuid(),
    candidateName: z.string(),
    status: z.enum(SESSION_STATUSES),
    currentSubtestCode: z.enum(SUBTEST_CODES).nullable(),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    accessCode: z
      .object({ code: z.string(), status: z.string(), expiresAt: z.iso.datetime() })
      .nullable(),
    progress: z.object({
      subtestsCompleted: z.number().int().nonnegative(),
      answered: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative(),
    }),
  }),
);

type LiveState = "connecting" | "live" | "reconnecting";

export function SessionDataTable({
  initialRows,
  manage = false,
}: {
  readonly initialRows: readonly SessionListRow[];
  readonly manage?: boolean;
}) {
  const [rows, setRows] = useState<SessionListRow[]>(() => [...initialRows]);
  const [liveState, setLiveState] = useState<LiveState>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    setRows([...initialRows]);
  }, [initialRows]);

  useEffect(() => {
    if (!manage) {
      return;
    }

    const stream = new EventSource("/api/hr/sessions/stream");
    stream.onopen = () => setLiveState("live");
    stream.onmessage = (event) => {
      try {
        const payload: unknown = JSON.parse(event.data);
        const parsed = sessionListSchema.safeParse(payload);
        if (!parsed.success) {
          setLiveState("reconnecting");
          return;
        }
        setRows(parsed.data);
        setLastUpdatedAt(new Date());
        setLiveState("live");
      } catch (error) {
        if (error instanceof SyntaxError) {
          setLiveState("reconnecting");
          return;
        }
        throw error;
      }
    };
    stream.onerror = () => setLiveState("reconnecting");

    return () => stream.close();
  }, [manage]);

  const columns = manage ? managementSessionColumns : recentSessionColumns;

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyMessage={manage ? "Tidak ada sesi yang cocok dengan filter." : "Belum ada sesi terbaru."}
      pageSize={manage ? 10 : 5}
      toolbar={
        manage
          ? (table) => {
              const participantFilter = table.getColumn("candidateName")?.getFilterValue();
              const statusFilter = table.getColumn("status")?.getFilterValue();
              const statusValue =
                typeof statusFilter === "string" ? statusFilter : ALL_SESSION_STATUSES;

              return (
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <label className="grid flex-1 gap-2 text-sm font-medium text-foreground">
                    Cari peserta
                    <Input
                      type="search"
                      value={typeof participantFilter === "string" ? participantFilter : ""}
                      placeholder="Nama peserta…"
                      className="h-10 max-w-md"
                      onChange={(event) => {
                        table.getColumn("candidateName")?.setFilterValue(event.target.value);
                        table.firstPage();
                      }}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    Status
                    <Select
                      value={statusValue}
                      onValueChange={(value) => {
                        table
                          .getColumn("status")
                          ?.setFilterValue(
                            value === null || value === ALL_SESSION_STATUSES ? undefined : value,
                          );
                        table.firstPage();
                      }}
                    >
                      <SelectTrigger className="h-10 w-full min-w-52">
                        <SelectValue placeholder="Semua status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={ALL_SESSION_STATUSES}>Semua status</SelectItem>
                          {Object.entries(SESSION_STATUS_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </label>
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground lg:ml-auto"
                  >
                    {liveState === "live" ? (
                      <Radio className="size-4 text-primary" aria-hidden="true" />
                    ) : (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    )}
                    <span>
                      {liveState === "live"
                        ? `Live${lastUpdatedAt ? ` · ${formatTime(lastUpdatedAt)}` : ""}`
                        : liveState === "connecting"
                          ? "Menghubungkan data live…"
                          : "Menyambungkan ulang…"}
                    </span>
                  </div>
                </div>
              );
            }
          : undefined
      }
    />
  );
}
