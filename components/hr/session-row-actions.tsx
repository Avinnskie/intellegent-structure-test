"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

export function SessionRowActions({
  sessionId,
  status,
  candidateName,
}: {
  sessionId: string;
  status: string;
  candidateName: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSkippingPapi, setIsSkippingPapi] = useState(false);
  const [isForceDeleting, setIsForceDeleting] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const isDeletable = status === "code_generated" || status === "code_validated";
  // Tahap PAPI yang belum tuntas boleh ditutup HR bila peserta tidak melanjutkan.
  const canSkipPapi =
    status === "papi_pending" || status === "papi_tutorial" || status === "papi_in_progress";

  async function handleDelete() {
    setIsConfirming(false);
    setIsBusy(true);
    try {
      const response = await fetch(`/api/hr/sessions/${sessionId}`, { method: "DELETE" });
      if (response.ok) {
        push("success", `Sesi untuk ${candidateName} dihapus.`);
        router.refresh();
        return;
      }
      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      push("error", envelope.error?.message ?? "Tidak dapat menghubungi server. Coba lagi.");
    } catch {
      push("error", "Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setIsBusy(false);
    }
  }

  /**
   * Menghapus sesi beserta seluruh jawaban dan hasilnya.
   *
   * Nama peserta wajib diketik ulang. Sesi yang sudah berjalan adalah riwayat
   * assessment yang tidak dapat dipulihkan, dan tombolnya berada tepat di
   * sebelah "Detail" — mengetik ulang memaksa HR berhenti sejenak dan membaca
   * baris mana yang sedang ia hapus.
   */
  async function handleForceDelete(typed: string) {
    if (typed.trim() !== candidateName.trim()) {
      push("error", "Nama peserta tidak cocok. Sesi tidak dihapus.");
      return;
    }
    setIsForceDeleting(false);
    setIsBusy(true);
    try {
      const response = await fetch(`/api/hr/sessions/${sessionId}/force-delete`, {
        method: "POST",
      });
      if (response.ok) {
        push("success", `Sesi ${candidateName} dan seluruh datanya dihapus.`);
        router.refresh();
        return;
      }
      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      push("error", envelope.error?.message ?? "Tidak dapat menghubungi server. Coba lagi.");
    } catch {
      push("error", "Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSkipPapi() {
    setIsSkippingPapi(false);
    setIsBusy(true);
    try {
      const response = await fetch(`/api/hr/sessions/${sessionId}/papi/skip`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "hr_closed_early" }),
      });
      if (response.ok) {
        push("success", `Sesi ${candidateName} ditutup tanpa PAPI. Hasil IST tetap diproses.`);
        router.refresh();
        return;
      }
      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      push("error", envelope.error?.message ?? "Tidak dapat menghubungi server. Coba lagi.");
    } catch {
      push("error", "Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap gap-3">
      <Link href={`/hr/sessions/${sessionId}`} className="font-semibold text-primary">
        Detail
      </Link>
      {isDeletable ? (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setIsConfirming(true)}
          className="font-semibold text-destructive hover:underline"
        >
          Hapus
        </button>
      ) : null}
      {!isDeletable ? (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setIsForceDeleting(true)}
          className="font-semibold text-destructive hover:underline"
        >
          Hapus paksa
        </button>
      ) : null}
      {canSkipPapi ? (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setIsSkippingPapi(true)}
          className="font-semibold text-muted-foreground hover:underline"
        >
          Tutup tanpa PAPI
        </button>
      ) : null}
      <ConfirmDialog
        open={isForceDeleting}
        title={`Hapus paksa sesi ${candidateName}?`}
        description={`Seluruh jawaban, skor, hasil, dan laporan sesi ini akan hilang permanen dan tidak dapat dipulihkan.`}
        confirmLabel="Hapus permanen"
        tone="danger"
        input={{ label: "Nama peserta", placeholder: candidateName, required: true }}
        isBusy={isBusy}
        onConfirm={(typed) => void handleForceDelete(typed)}
        onCancel={() => setIsForceDeleting(false)}
      />
      <ConfirmDialog
        open={isSkippingPapi}
        title={`Tutup sesi ${candidateName} tanpa PAPI?`}
        description="Hasil IST tetap dihitung dan dilaporkan. Jawaban PAPI yang sudah masuk tidak diskor — skor ipsatif hanya sah bila seluruh 90 nomor terisi. Kode akses langsung dinonaktifkan dan tindakan ini tercatat di audit."
        confirmLabel="Tutup tanpa PAPI"
        isBusy={isBusy}
        onConfirm={() => void handleSkipPapi()}
        onCancel={() => setIsSkippingPapi(false)}
      />
      <ConfirmDialog
        open={isConfirming}
        title={`Hapus sesi ${candidateName}?`}
        description="Hanya sesi yang belum dikerjakan yang dapat dihapus. Kode akses dan token ikut terhapus; jejak audit tetap tersimpan."
        confirmLabel="Hapus sesi"
        tone="danger"
        isBusy={isBusy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setIsConfirming(false)}
      />
    </span>
  );
}
