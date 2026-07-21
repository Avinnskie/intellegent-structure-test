"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

/**
 * Row actions on the session list. Delete appears ONLY while nothing was sat
 * (code_generated/code_validated) — the server re-enforces it; later stages are history.
 */
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
  const [isBusy, setIsBusy] = useState(false);

  const isDeletable = status === "code_generated" || status === "code_validated";

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

  return (
    <span className="flex flex-wrap gap-3">
      <Link href={`/hr/sessions/${sessionId}`} className="font-semibold text-[var(--accent-primary)]">
        Detail
      </Link>
      {isDeletable ? (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setIsConfirming(true)}
          className="font-semibold text-[var(--status-error)] hover:underline"
        >
          Hapus
        </button>
      ) : null}
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
