"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
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

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Coba lagi.";

const TTL_OPTIONS = [
  { hours: 24, label: "24 jam" },
  { hours: 48, label: "48 jam (default)" },
  { hours: 72, label: "3 hari" },
  { hours: 168, label: "7 hari" },
];

type CandidateOption = { id: string; fullName: string; birthDate: string };

type CreatedSession = {
  sessionId: string;
  accessCode: string;
  accessCodeMasked: string;
  accessCodeExpiresAt: string;
};

/**
 * Session creation in a shadcn modal. The success state INSIDE the modal is the only place the
 * plaintext code ever appears — closing it is the moment the code is gone (regenerate is the
 * rescue).
 */
export function SessionCreateModal({ candidates }: { candidates: readonly CandidateOption[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("48");
  const [reentryPolicy, setReentryPolicy] = useState<"single" | "multi">("single");
  const [isBusy, setIsBusy] = useState(false);
  const [created, setCreated] = useState<CreatedSession | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  function close() {
    setIsOpen(false);
    setCreated(null);
    setCandidateId("");
    setHasCopied(false);
  }

  async function handleCreate() {
    if (!candidateId) {
      return;
    }
    setIsBusy(true);
    try {
      const response = await fetch("/api/hr/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateId,
          expiresInHours: Number(expiresInHours),
          reentryPolicy,
        }),
      });
      if (response.ok) {
        setCreated((await response.json()) as CreatedSession);
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

  return (
    <>
      <Button
        className="h-12 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)]px-3"
        onClick={() => setIsOpen(true)}
      >
        Buat sesi &amp; generate kode
      </Button>

      <Modal
        open={isOpen}
        title={created ? "Sesi dibuat — salin kode SEKARANG" : "Buat sesi & kode akses"}
        description={
          created
            ? "Kode hanya ditampilkan satu kali. Setelah modal ini ditutup, yang tersisa hanya versi tersamar."
            : "Sesi mengunci versi form, kunci skoring, norma, dan tutorial yang published saat ini."
        }
        onClose={close}
      >
        {created ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--accent-primary)] bg-[var(--accent-soft)] p-5">
              <p className="font-mono text-2xl font-bold tracking-[0.06em] text-[var(--text-primary)]">
                {created.accessCode}
              </p>
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(created.accessCode).then(() => {
                    setHasCopied(true);
                    push("success", "Kode tersalin ke clipboard.");
                  });
                }}
              >
                {hasCopied ? "Tersalin ✓" : "Salin kode"}
              </Button>
            </div>
            <p className="text-xs leading-5 text-[var(--text-muted)]">
              Berlaku sampai {new Date(created.accessCodeExpiresAt).toLocaleString("id-ID")} ·
              tampil di daftar sebagai <span className="font-mono">{created.accessCodeMasked}</span>
            </p>
            <div className="flex flex-wrap gap-3 border-t border-[var(--border-subtle)] pt-4">
              <Link
                href={`/hr/sessions/${created.sessionId}`}
                onClick={close}
                className={buttonVariants()}
              >
                Buka detail sesi
              </Link>
              <Button variant="outline" onClick={close}>
                Selesai
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Peserta</Label>
              <Select value={candidateId} onValueChange={(value) => setCandidateId(value ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih peserta…">
                    {(value: string | null) => {
                      if (!value) {
                        return "Pilih peserta…";
                      }
                      const selected = candidates.find((candidate) => candidate.id === value);
                      return selected
                        ? `${selected.fullName} — lahir ${selected.birthDate}`
                        : value;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((candidate) => (
                    <SelectItem
                      key={candidate.id}
                      value={candidate.id}
                      label={`${candidate.fullName} lahir ${candidate.birthDate}`}
                    >
                      {candidate.fullName} — lahir {candidate.birthDate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              <Label>Kebijakan masuk kode</Label>
              <Select
                value={reentryPolicy}
                onValueChange={(value) =>
                  setReentryPolicy((value ?? "single") as "single" | "multi")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string | null) =>
                      value === "multi"
                        ? "Boleh masuk berulang selama tes berjalan"
                        : "Sekali pakai — keluar/tutup web berarti minta kode baru ke HR"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="single"
                    label="Sekali pakai — keluar/tutup web berarti minta kode baru ke HR"
                  >
                    Sekali pakai — keluar/tutup web berarti minta kode baru ke HR
                  </SelectItem>
                  <SelectItem
                    value="multi"
                    label="Boleh masuk berulang selama tes berjalan"
                  >
                    Boleh masuk berulang selama tes berjalan
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs leading-5 text-[var(--text-muted)]">
                Apa pun kebijakannya, kode dari sesi yang sudah selesai tes tidak dapat dipakai
                masuk lagi.
              </p>
            </div>
            {candidates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-base)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
                Belum ada peserta — tambahkan lewat halaman Peserta terlebih dahulu.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3 border-t border-[var(--border-subtle)] pt-4">
              <Button
                className="h-12 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)]"
                disabled={isBusy || candidateId === ""}
                onClick={handleCreate}
              >
                {isBusy ? "Membuat sesi…" : "Buat sesi & generate kode"}
              </Button>
              <Button className="h-12" variant="outline" onClick={close}>
                Batal
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
