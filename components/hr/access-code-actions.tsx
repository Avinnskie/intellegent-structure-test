"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Coba lagi.";

type RegeneratedCode = { accessCode: string; accessCodeExpiresAt: string };

type PendingAction = "revoke" | "regenerate" | null;

/**
 * Revoke / regenerate controls on the session detail page. Confirmation runs through the in-app
 * dialog (revoke carries the optional audited reason field); outcomes surface as toasts. A
 * regenerated code appears ONCE in the panel below the buttons, exactly like the creation screen.
 */
export function AccessCodeActions({
  sessionId,
  codeStatus,
}: {
  sessionId: string;
  codeStatus: string | null;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [isBusy, setIsBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [regenerated, setRegenerated] = useState<RegeneratedCode | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  const canRevoke = codeStatus === "active" || codeStatus === "in_use";

  async function call(path: string, body?: unknown): Promise<Response | null> {
    setIsBusy(true);
    try {
      return await fetch(path, {
        method: "POST",
        ...(body !== undefined
          ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      });
    } catch {
      push("error", NETWORK_ERROR_MESSAGE);
      return null;
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRevoke(reason: string) {
    const response = await call(
      `/api/hr/sessions/${sessionId}/access-code/revoke`,
      reason ? { reason } : undefined,
    );
    setPending(null);
    if (!response) {
      return;
    }
    if (response.ok) {
      push("success", "Kode akses dicabut. Token peserta yang aktif ikut diputus.");
      router.refresh();
      return;
    }
    const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
    push("error", envelope.error?.message ?? NETWORK_ERROR_MESSAGE);
  }

  async function handleRegenerate() {
    const response = await call(`/api/hr/sessions/${sessionId}/access-code/regenerate`);
    setPending(null);
    if (!response) {
      return;
    }
    if (response.ok) {
      const dto = (await response.json()) as RegeneratedCode;
      setRegenerated(dto);
      setHasCopied(false);
      push("success", "Kode baru dibuat — salin sekarang, hanya tampil sekali.");
      router.refresh();
      return;
    }
    const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
    push("error", envelope.error?.message ?? NETWORK_ERROR_MESSAGE);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setPending("regenerate")}
          disabled={isBusy}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Buat ulang kode
        </button>
        <button
          type="button"
          onClick={() => setPending("revoke")}
          disabled={isBusy || !canRevoke}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--status-error)]/40 px-4 text-sm font-semibold text-[var(--status-error)] hover:bg-[color-mix(in_srgb,var(--status-error)_8%,white)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cabut kode
        </button>
      </div>

      <ConfirmDialog
        open={pending === "revoke"}
        title="Cabut kode akses?"
        description="Peserta yang sedang mengerjakan akan langsung terputus dan kode tidak dapat dipakai lagi. Tindakan ini tercatat di audit log."
        confirmLabel="Cabut kode"
        tone="danger"
        input={{ label: "Alasan pencabutan (opsional)", placeholder: "mis. indikasi kecurangan" }}
        isBusy={isBusy}
        onConfirm={(reason) => void handleRevoke(reason)}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === "regenerate"}
        title="Buat ulang kode akses?"
        description="Kode lama langsung nonaktif dan kode baru hanya ditampilkan satu kali. Sesi yang sedang berjalan tidak terganggu."
        confirmLabel="Buat ulang"
        isBusy={isBusy}
        onConfirm={() => void handleRegenerate()}
        onCancel={() => setPending(null)}
      />

      {regenerated ? (
        <div className="rounded-xl border border-[var(--accent-primary)] bg-[var(--accent-soft)] p-5">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Kode baru — salin SEKARANG, tidak akan ditampilkan lagi:
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <p className="font-mono text-2xl font-bold tracking-[0.06em] text-[var(--text-primary)]">
              {regenerated.accessCode}
            </p>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(regenerated.accessCode).then(() => {
                  setHasCopied(true);
                  push("success", "Kode tersalin ke clipboard.");
                });
              }}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
            >
              {hasCopied ? "Tersalin ✓" : "Salin"}
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Berlaku sampai {new Date(regenerated.accessCodeExpiresAt).toLocaleString("id-ID")}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
