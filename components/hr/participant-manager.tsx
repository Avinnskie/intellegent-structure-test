"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { calculateExactAge } from "@/lib/domain/age";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Coba lagi.";
const TEST_PURPOSES = ["Rekrutmen", "Pemetaan internal", "Pengembangan"];
/** Radix Select cannot carry an empty-string item value; this sentinel maps to "not set". */
const NONE = "__none__";

export type CandidateRow = {
  id: string;
  fullName: string;
  birthDate: string;
  testPurpose: string;
  gender: string | null;
  education: string | null;
  createdAt: string;
};

type Draft = {
  /** null = creating. */
  id: string | null;
  fullName: string;
  birthDate: string;
  testPurpose: string;
  gender: string;
  education: string;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  fullName: "",
  birthDate: "",
  testPurpose: TEST_PURPOSES[0] as string,
  gender: NONE,
  education: "",
};

/**
 * Candidate CRUD in shadcn modals. Create/edit share one form; delete is confirmed and the server
 * refuses candidates that already have sessions (history never vanishes).
 */
export function ParticipantManager({ candidates }: { candidates: readonly CandidateRow[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const router = useRouter();
  const { push } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CandidateRow | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function call(path: string, method: string, body?: unknown): Promise<boolean> {
    setIsBusy(true);
    try {
      const response = await fetch(path, {
        method,
        ...(body !== undefined
          ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      });
      if (response.ok) {
        router.refresh();
        return true;
      }
      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      push("error", envelope.error?.message ?? NETWORK_ERROR_MESSAGE);
      return false;
    } catch {
      push("error", NETWORK_ERROR_MESSAGE);
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSave() {
    if (!draft) {
      return;
    }
    const payload = {
      fullName: draft.fullName.trim(),
      birthDate: draft.birthDate,
      testPurpose: draft.testPurpose,
      ...(draft.gender !== NONE ? { gender: draft.gender } : {}),
      ...(draft.education.trim() ? { education: draft.education.trim() } : {}),
    };
    const ok = draft.id
      ? await call(`/api/hr/candidates/${draft.id}`, "PUT", payload)
      : await call("/api/hr/candidates", "POST", payload);
    if (ok) {
      setDraft(null);
      push("success", draft.id ? "Data peserta diperbarui." : "Peserta ditambahkan.");
    }
  }

  return (
    <section className="space-y-6">
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Hapus peserta ${pendingDelete?.fullName}?`}
        description="Hanya peserta TANPA sesi assessment yang dapat dihapus — riwayat tes tidak pernah ikut terhapus. Tindakan ini tercatat di audit log."
        confirmLabel="Hapus"
        tone="danger"
        isBusy={isBusy}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) {
            void call(`/api/hr/candidates/${target.id}`, "DELETE").then((ok) => {
              if (ok) {
                push("success", `Peserta ${target.fullName} dihapus.`);
              }
            });
          }
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <Modal
        open={draft !== null}
        title={draft?.id ? "Edit peserta" : "Tambah peserta"}
        description="Tanggal lahir menentukan norm band usia saat scoring — pastikan benar."
        onClose={() => setDraft(null)}
      >
        {draft ? (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="candidate-name">Nama lengkap</Label>
              <Input
                id="candidate-name"
                value={draft.fullName}
                maxLength={200}
                onChange={(event) => setDraft({ ...draft, fullName: event.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="candidate-birth">Tanggal lahir</Label>
              <Input
                id="candidate-birth"
                type="date"
                value={draft.birthDate}
                onChange={(event) => setDraft({ ...draft, birthDate: event.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>
                  Jenis kelamin{" "}
                  <span className="font-normal text-[var(--text-muted)]">(opsional)</span>
                </Label>
                <Select
                  value={draft.gender}
                  onValueChange={(gender) => setDraft({ ...draft, gender: gender ?? NONE })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string | null) =>
                        value === "L"
                          ? "Laki-laki"
                          : value === "P"
                            ? "Perempuan"
                            : "—"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE} label="—">
                      —
                    </SelectItem>
                    <SelectItem value="L" label="Laki-laki">
                      Laki-laki
                    </SelectItem>
                    <SelectItem value="P" label="Perempuan">
                      Perempuan
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="candidate-education">
                  Pendidikan{" "}
                  <span className="font-normal text-[var(--text-muted)]">(opsional)</span>
                </Label>
                <Input
                  id="candidate-education"
                  value={draft.education}
                  maxLength={100}
                  placeholder="cth. S1"
                  onChange={(event) => setDraft({ ...draft, education: event.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Tujuan tes</Label>
              <Select
                value={draft.testPurpose}
                onValueChange={(testPurpose) =>
                  setDraft({ ...draft, testPurpose: testPurpose ?? draft.testPurpose })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string | null) => value ?? "—"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TEST_PURPOSES.map((item) => (
                    <SelectItem key={item} value={item} label={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-3 border-t border-[var(--border-subtle)] pt-4">
              <Button
                disabled={isBusy || draft.fullName.trim() === "" || draft.birthDate === ""}
                onClick={handleSave}
              >
                {draft.id ? "Simpan perubahan" : "Simpan peserta"}
              </Button>
              <Button variant="outline" onClick={() => setDraft(null)}>
                Batal
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <article className="overflow-x-auto rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
            Peserta terdaftar
          </h2>
          <div className="flex items-center gap-4">
            <p className="text-sm text-[var(--text-muted)]">{candidates.length} peserta</p>
            <Button
              className="h-12 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] px-3"
              onClick={() => setDraft(EMPTY_DRAFT)}
            >
              Tambah peserta
            </Button>
          </div>
        </div>
        {candidates.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-base)] p-6 text-sm leading-6 text-[var(--text-secondary)]">
            Belum ada peserta. Tambahkan peserta lalu buat sesi tes untuknya.
          </p>
        ) : (
          <table className="mt-6 min-w-full text-left">
            <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <tr>
                <th className="pb-3">Nama</th>
                <th className="pb-3">Tanggal lahir</th>
                <th className="pb-3">Usia saat ini</th>
                <th className="pb-3">Tujuan</th>
                <th className="pb-3">Terdaftar</th>
                <th className="pb-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="text-sm text-[var(--text-primary)]">
              {candidates.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border-subtle)]">
                  <td className="py-4 font-semibold">{row.fullName}</td>
                  <td className="py-4">{row.birthDate}</td>
                  <td className="py-4">{calculateExactAge(row.birthDate, today)} tahun</td>
                  <td className="py-4">{row.testPurpose}</td>
                  <td className="py-4">{row.createdAt.slice(0, 10)}</td>
                  <td className="py-4">
                    <span className="flex flex-wrap gap-1">
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        disabled={isBusy}
                        onClick={() =>
                          setDraft({
                            id: row.id,
                            fullName: row.fullName,
                            birthDate: row.birthDate,
                            testPurpose: row.testPurpose,
                            gender: row.gender ?? NONE,
                            education: row.education ?? "",
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-[var(--status-error)]"
                        disabled={isBusy}
                        onClick={() => setPendingDelete(row)}
                      >
                        Hapus
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </section>
  );
}
