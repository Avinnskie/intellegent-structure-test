"use client";

import { useState } from "react";
import { PrototypeBadge } from "@/components/ui/prototype-badge";
import { participantRows, type AccessCodeStatus } from "@/lib/ist-data";
import { generateAccessCode } from "@/lib/ist-logic";

type IssuedCode = {
  readonly code: string;
  readonly status: AccessCodeStatus;
};

const purposes = ["Rekrutmen", "Pemetaan internal", "Pengembangan"] as const;

export function SessionCreateForm() {
  const [participantId, setParticipantId] = useState<string>(participantRows[0].id);
  const [purpose, setPurpose] = useState<string>(purposes[0]);
  const [testDate, setTestDate] = useState("2026-07-13");
  const [issuedCodes, setIssuedCodes] = useState<readonly IssuedCode[]>([]);
  const [copyState, setCopyState] = useState<string | null>(null);

  const activeCode = issuedCodes.find((issued) => issued.status === "active");
  const participant = participantRows.find((row) => row.id === participantId);

  function handleGenerate() {
    const newCode = generateAccessCode();
    setIssuedCodes((current) => [
      { code: newCode, status: "active" },
      ...current.map((issued) =>
        issued.status === "active" ? { ...issued, status: "regenerated" as const } : issued,
      ),
    ]);
    setCopyState(null);
  }

  function handleRevoke() {
    setIssuedCodes((current) =>
      current.map((issued) =>
        issued.status === "active" ? { ...issued, status: "revoked" as const } : issued,
      ),
    );
    setCopyState(null);
  }

  async function handleCopy() {
    if (!activeCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeCode.code);
      setCopyState("Kode disalin ke clipboard.");
    } catch {
      setCopyState("Clipboard tidak tersedia. Salin kode secara manual.");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <form
        className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]"
        onSubmit={(event) => {
          event.preventDefault();
          handleGenerate();
        }}
      >
        <PrototypeBadge tone="info">Simulasi in-memory</PrototypeBadge>
        <h2 className="mt-5 text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
          Data sesi
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Kode aktif segera setelah dibuat. Data hilang saat halaman dimuat ulang karena prototype
          tidak menyimpan state.
        </p>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
            Peserta
            <select
              value={participantId}
              onChange={(event) => setParticipantId(event.target.value)}
              className="h-12 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-4 text-sm font-medium text-[var(--text-primary)]"
            >
              {participantRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.id})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
            Tanggal tes
            <input
              type="date"
              value={testDate}
              onChange={(event) => setTestDate(event.target.value)}
              className="h-12 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-4 text-sm font-medium text-[var(--text-primary)]"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
            Tujuan tes
            <select
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              className="h-12 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-4 text-sm font-medium text-[var(--text-primary)]"
            >
              {purposes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-[var(--accent-hover)]"
          >
            {activeCode ? "Regenerate kode" : "Buat sesi & generate kode"}
          </button>
          <button
            type="button"
            onClick={handleRevoke}
            disabled={!activeCode}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Revoke kode aktif
          </button>
        </div>
      </form>

      <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--accent-soft)] p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Kode akses
        </p>

        {activeCode ? (
          <div className="mt-5 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-mono text-3xl font-semibold tracking-[0.04em] text-[var(--text-primary)]">
                  {activeCode.code}
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {participant?.name} · {purpose} · {testDate}
                </p>
              </div>
              <PrototypeBadge tone="success">active</PrototypeBadge>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-default)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
              >
                Salin kode
              </button>
              {copyState ? (
                <p className="text-sm text-[var(--text-secondary)]" role="status">
                  {copyState}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              Belum ada kode aktif. Satu kode hanya memiliki satu sesi aktif; regenerate akan
              menonaktifkan kode lama secara otomatis.
            </p>
          </div>
        )}

        {issuedCodes.length > 1 || (issuedCodes.length === 1 && !activeCode) ? (
          <div className="mt-5">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Riwayat kode sesi ini
            </p>
            <ul className="mt-3 grid gap-2">
              {issuedCodes
                .filter((issued) => issued.status !== "active")
                .map((issued) => (
                  <li
                    key={issued.code}
                    className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-4 py-3"
                  >
                    <span className="font-mono text-sm text-[var(--text-muted)] line-through">
                      {issued.code}
                    </span>
                    <PrototypeBadge tone={issued.status === "revoked" ? "danger" : "warning"}>
                      {issued.status}
                    </PrototypeBadge>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </article>
    </div>
  );
}
