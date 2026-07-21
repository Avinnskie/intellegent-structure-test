"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Coba lagi.";
const MAX_ROWS = 200;

const TTL_OPTIONS = [
  { hours: 24, label: "24 jam" },
  { hours: 48, label: "48 jam (default)" },
  { hours: 72, label: "3 hari" },
  { hours: 168, label: "7 hari" },
];

type ParsedRow = {
  line: number;
  fullName: string;
  birthDate: string;
  gender?: string;
  education?: string;
  testPurpose?: string;
};

type ParseResult = { rows: ParsedRow[]; errors: { line: number; message: string }[] };

/** `DD/MM/YYYY`, `DD-MM-YYYY`, dan `YYYY-MM-DD` → `YYYY-MM-DD`; null bila bukan tanggal sah. */
function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  let year: number;
  let month: number;
  let day: number;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  const idn = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (idn) {
    [day, month, year] = [Number(idn[1]), Number(idn[2]), Number(idn[3])];
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const isReal =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isReal || date.getTime() >= Date.now()) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeGender(raw: string): string | null | undefined {
  const value = raw.trim().toLowerCase();
  if (value === "") {
    return undefined;
  }
  if (["l", "laki", "laki-laki", "pria", "m"].includes(value)) {
    return "L";
  }
  if (["p", "perempuan", "wanita", "f"].includes(value)) {
    return "P";
  }
  return null;
}

/**
 * Paste dari Excel memisahkan kolom dengan TAB; paste manual boleh memakai `|`. Baris header
 * (mengandung "nama") dilewati otomatis.
 */
function parsePaste(text: string): ParseResult {
  const rows: ParsedRow[] = [];
  const errors: { line: number; message: string }[] = [];

  const lines = text.split(/\r?\n/);
  for (const [index, rawLine] of lines.entries()) {
    const line = index + 1;
    const trimmed = rawLine.trim();
    if (trimmed === "") {
      continue;
    }
    const separator = trimmed.includes("\t") ? "\t" : "|";
    const cells = trimmed.split(separator).map((cell) => cell.trim());

    if (index === 0 && /nama/i.test(cells[0] ?? "") && normalizeDate(cells[1] ?? "") === null) {
      continue; // header row
    }

    const [name, dateRaw, genderRaw, education, purpose] = cells;
    if (!name || !dateRaw) {
      errors.push({ line, message: "Butuh minimal: Nama | Tanggal lahir." });
      continue;
    }
    const birthDate = normalizeDate(dateRaw);
    if (!birthDate) {
      errors.push({
        line,
        message: `Tanggal "${dateRaw}" tidak sah (pakai YYYY-MM-DD atau DD/MM/YYYY, di masa lalu).`,
      });
      continue;
    }
    const gender = normalizeGender(genderRaw ?? "");
    if (gender === null) {
      errors.push({ line, message: `Jenis kelamin "${genderRaw}" tidak dikenal (L/P).` });
      continue;
    }

    rows.push({
      line,
      fullName: name.slice(0, 200),
      birthDate,
      ...(gender ? { gender } : {}),
      ...(education?.trim() ? { education: education.trim().slice(0, 100) } : {}),
      ...(purpose?.trim() ? { testPurpose: purpose.trim().slice(0, 200) } : {}),
    });
  }

  if (rows.length > MAX_ROWS) {
    errors.push({
      line: 0,
      message: `Maksimal ${MAX_ROWS} baris per impor (terbaca ${rows.length}).`,
    });
  }
  return { rows, errors };
}

type BulkCreatedRow = {
  fullName: string;
  birthDate: string;
  accessCode: string;
  accessCodeMasked: string;
};

type BulkResult = {
  created: BulkCreatedRow[];
  accessCodeExpiresAt: string;
  reentryPolicy: "single" | "multi";
};

export function SessionBulkModal() {
  const router = useRouter();
  const { push } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("48");

  const [reentryPolicy, setReentryPolicy] = useState<"single" | "multi">("multi");
  const [isBusy, setIsBusy] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [hasCopiedAll, setHasCopiedAll] = useState(false);

  const parsed = useMemo(() => parsePaste(text), [text]);
  const canSubmit = !isBusy && parsed.rows.length > 0 && parsed.errors.length === 0;

  function close() {
    setIsOpen(false);
    setText("");
    setResult(null);
    setHasCopiedAll(false);
  }

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }
    setIsBusy(true);
    try {
      const response = await fetch("/api/hr/sessions/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: parsed.rows.map((row) => ({
            fullName: row.fullName,
            birthDate: row.birthDate,
            ...(row.gender ? { gender: row.gender } : {}),
            ...(row.education ? { education: row.education } : {}),
            ...(row.testPurpose ? { testPurpose: row.testPurpose } : {}),
          })),
          expiresInHours: Number(expiresInHours),
          reentryPolicy,
        }),
      });
      if (response.ok) {
        setResult((await response.json()) as BulkResult);
        router.refresh();
        return;
      }
      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      push("error", envelope.error?.message ?? NETWORK_ERROR_MESSAGE);
    } catch {
      push("error", NETWORK_ERROR_MESSAGE);
    } finally {
      setIsBusy(false);
    }
  }

  function copyAll() {
    if (!result) {
      return;
    }
    const lines = result.created
      .map((row) => `${row.fullName}\t${row.birthDate}\t${row.accessCode}`)
      .join("\n");
    void navigator.clipboard.writeText(lines).then(() => {
      setHasCopiedAll(true);
      push(
        "success",
        `${result.created.length} baris (nama + kode) tersalin — siap di-paste ke Excel.`,
      );
    });
  }

  return (
    <>
      <Button variant="outline" className="h-12" onClick={() => setIsOpen(true)}>
        Impor massal
      </Button>

      <Modal
        open={isOpen}
        title={result ? "Sesi massal dibuat — salin kode SEKARANG" : "Impor sesi massal"}
        description={
          result
            ? "Kode di bawah hanya ditampilkan satu kali. Salin semuanya sebelum menutup modal ini."
            : "Tempel daftar dari Excel/Word. Format per baris: Nama | Tanggal lahir | Jenis kelamin (ops.) | Pendidikan (ops.) | Tujuan (ops.). Paste dari Excel (kolom TAB) juga dikenali."
        }
        size="lg"
        onClose={close}
      >
        {result ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {result.created.length} peserta + sesi + kode dibuat · berlaku sampai{" "}
                {new Date(result.accessCodeExpiresAt).toLocaleString("id-ID")} ·{" "}
                {result.reentryPolicy === "multi" ? "boleh masuk berulang" : "sekali pakai"}
              </p>
              <Button size="sm" onClick={copyAll}>
                {hasCopiedAll ? "Tersalin ✓" : "Salin semua (nama + kode)"}
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-[var(--border-default)]">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-[var(--surface-subtle)] text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-2">Nama</th>
                    <th className="px-4 py-2">Tanggal lahir</th>
                    <th className="px-4 py-2">Kode akses</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--text-primary)]">
                  {result.created.map((row) => (
                    <tr
                      key={row.accessCodeMasked + row.fullName}
                      className="border-t border-[var(--border-subtle)]"
                    >
                      <td className="px-4 py-2 font-semibold">{row.fullName}</td>
                      <td className="px-4 py-2">{row.birthDate}</td>
                      <td className="px-4 py-2 font-mono font-bold">{row.accessCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end border-t border-[var(--border-subtle)] pt-4">
              <Button variant="outline" onClick={close}>
                Selesai
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="bulk-paste">Daftar peserta</Label>
              <Textarea
                id="bulk-paste"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={8}
                placeholder={`Budi Santoso | 1998-04-12 | L\nSiti Aminah | 12/07/2000 | P | S1\nAndi Wijaya | 1999-01-30`}
                className="font-mono text-xs"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Masa berlaku kode</Label>
                <Select
                  value={expiresInHours}
                  onValueChange={(value) => setExpiresInHours(value ?? "48")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string | null) => {
                        const found = TTL_OPTIONS.find((option) => String(option.hours) === value);
                        return found ? found.label : (value ?? "");
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TTL_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.hours}
                        value={String(option.hours)}
                        label={option.label}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Kebijakan masuk kode (seluruh batch)</Label>
                <Select
                  value={reentryPolicy}
                  onValueChange={(value) =>
                    setReentryPolicy((value ?? "multi") as "single" | "multi")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string | null) =>
                        value === "single"
                          ? "Sekali pakai — keluar web berarti minta kode baru"
                          : "Boleh masuk berulang (default impor massal)"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multi" label="Boleh masuk berulang (default impor massal)">
                      Boleh masuk berulang (default impor massal)
                    </SelectItem>
                    <SelectItem
                      value="single"
                      label="Sekali pakai — keluar web berarti minta kode baru"
                    >
                      Sekali pakai — keluar web berarti minta kode baru
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {text.trim() !== "" ? (
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] p-4 text-sm leading-6">
                <p className="font-semibold text-[var(--text-primary)]">
                  {parsed.rows.length} baris siap dibuat
                  {parsed.errors.length > 0 ? ` · ${parsed.errors.length} baris bermasalah` : ""}
                </p>
                {parsed.errors.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc text-[var(--status-error)]">
                    {parsed.errors.slice(0, 5).map((error) => (
                      <li key={`${error.line}-${error.message}`}>
                        {error.line > 0 ? `Baris ${error.line}: ` : ""}
                        {error.message}
                      </li>
                    ))}
                    {parsed.errors.length > 5 ? (
                      <li>… dan {parsed.errors.length - 5} lainnya.</li>
                    ) : null}
                  </ul>
                ) : parsed.rows.length > 0 ? (
                  <p className="mt-1 text-[var(--text-secondary)]">
                    Contoh terbaca: {parsed.rows[0]?.fullName} — lahir {parsed.rows[0]?.birthDate}
                    {parsed.rows[0]?.gender ? ` — ${parsed.rows[0]?.gender}` : ""}. Impor bersifat
                    semua-atau-tidak: satu baris gagal berarti tidak ada yang dibuat.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 border-t border-[var(--border-subtle)] pt-4">
              <Button disabled={!canSubmit} onClick={handleSubmit}>
                {isBusy
                  ? "Membuat sesi massal…"
                  : `Buat ${parsed.rows.length || ""} sesi & kode`.replace("  ", " ")}
              </Button>
              <Button variant="outline" onClick={close}>
                Batal
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
