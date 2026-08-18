"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR = "Tidak dapat menghubungi server. Coba lagi.";

/**
 * Tindakan untuk sesi PAPI-saja.
 *
 * Terpisah dari `ResultActions` karena tindakan di sana bekerja atas
 * `assessment_results` — baris hasil IST yang tidak pernah ada pada sesi ini.
 * Menyatukannya berarti setiap tombol harus bercabang di dalam, dan cabang
 * yang salah akan mengunci sesi lewat jalur yang keliru.
 */
export function PapiOnlyActions({
  sessionId,
  isFinal,
}: {
  readonly sessionId: string;
  readonly isFinal: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  async function finalize() {
    setIsConfirming(false);
    setIsBusy(true);
    try {
      const response = await fetch(`/api/hr/sessions/${sessionId}/papi/finalize`, {
        method: "POST",
      });
      if (response.ok) {
        push("success", "Hasil PAPI difinalisasi.");
        router.refresh();
        return;
      }
      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      push("error", envelope.error?.message ?? NETWORK_ERROR);
    } catch {
      push("error", NETWORK_ERROR);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/*
        Unduhan memakai tautan biasa, bukan fetch: peramban yang menangani
        penyimpanan berkas, dan itu bekerja pada PDF berukuran berapa pun tanpa
        menahan seluruh isinya di memori JavaScript.
      */}
      <a
        href={`/api/hr/sessions/${sessionId}/papi/report`}
        className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted"
      >
        Unduh laporan PAPI (PDF)
      </a>

      {isFinal ? (
        <span className="text-sm text-muted-foreground">Hasil sudah final dan terkunci.</span>
      ) : (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setIsConfirming(true)}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy ? "Memfinalisasi…" : "Finalisasi hasil PAPI"}
        </button>
      )}

      <ConfirmDialog
        open={isConfirming}
        title="Finalisasi hasil PAPI?"
        description="Setelah final, hasil terkunci dan tidak dapat diubah lagi. Sesi ikut ditandai selesai."
        confirmLabel="Finalisasi"
        isBusy={isBusy}
        onConfirm={() => void finalize()}
        onCancel={() => setIsConfirming(false)}
      />
    </div>
  );
}
