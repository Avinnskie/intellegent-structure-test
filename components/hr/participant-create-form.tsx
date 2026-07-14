"use client";

import { useState } from "react";
import Link from "next/link";
import { PrototypeBadge } from "@/components/ui/prototype-badge";
import { calculateExactAge } from "@/lib/ist-logic";

type SavedParticipant = {
  readonly name: string;
  readonly birthDate: string;
  readonly purpose: string;
};

export function ParticipantCreateForm() {
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [purpose, setPurpose] = useState("Rekrutmen");
  const [saved, setSaved] = useState<SavedParticipant | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim() || !birthDate) {
      setError("Nama dan tanggal lahir wajib diisi sebelum peserta disimpan.");
      return;
    }

    setError(null);
    setSaved({ name: name.trim(), birthDate, purpose });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]"
      >
        <PrototypeBadge tone="info">Simulasi in-memory</PrototypeBadge>
        <h2 className="mt-5 text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
          Identitas peserta
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Tanggal lahir menentukan norm band usia saat scoring. Data prototype hilang saat halaman
          dimuat ulang.
        </p>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
            Nama lengkap
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nama peserta fiktif"
              className="h-12 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-4 text-sm font-medium text-[var(--text-primary)]"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
            Tanggal lahir
            <input
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
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
              {["Rekrutmen", "Pemetaan internal", "Pengembangan"].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <p className="mt-4 text-sm font-semibold text-[var(--status-error)]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-[var(--accent-hover)]"
          >
            Simpan peserta demo
          </button>
          <Link
            href="/hr/participants"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
          >
            Kembali ke daftar
          </Link>
        </div>
      </form>

      <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--accent-soft)] p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Ringkasan
        </p>

        {saved ? (
          <div className="mt-5 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">
                  {saved.name}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Lahir {saved.birthDate} · {calculateExactAge(saved.birthDate, "2026-07-13")} tahun
                  pada 13 Juli 2026 · {saved.purpose}
                </p>
              </div>
              <PrototypeBadge tone="success">Tersimpan</PrototypeBadge>
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
              Lanjutkan dengan membuat sesi dan kode akses untuk peserta ini.
            </p>
            <Link
              href="/hr/sessions/new"
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
            >
              Buat sesi untuk peserta
            </Link>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              Isi formulir untuk melihat ringkasan peserta, termasuk usia yang dihitung penuh (bukan
              selisih tahun) sesuai aturan norma IST.
            </p>
          </div>
        )}
      </article>
    </div>
  );
}
