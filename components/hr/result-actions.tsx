"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Coba lagi.";

type ResultActionsProps = {
  readonly sessionId: string;
  readonly resultId: string | null;
  readonly resultStatus: string | null;
  readonly sessionStatus: string;
};

type PendingAction = "review" | "finalize" | "override" | null;

/**
 * The result lifecycle buttons: calculate, review (notes required), finalize (confirmed), and the
 * audited override over a final result (reason required). Confirmations and required inputs run
 * through the in-app dialog — required reasons are ENFORCED by the disabled confirm button, which
 * window.prompt could never do; outcomes surface as toasts. Every action ends in
 * `router.refresh()` so the UI can never show a state the database does not hold.
 */
export function ResultActions({
  sessionId,
  resultId,
  resultStatus,
  sessionStatus,
}: ResultActionsProps) {
  const router = useRouter();
  const { push } = useToast();
  const [isBusy, setIsBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);

  /** Success toasts belong to the CALLER, and only on a true return — an error already toasted. */
  async function post(path: string, body?: unknown): Promise<boolean> {
    setIsBusy(true);
    try {
      const response = await fetch(path, {
        method: "POST",
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

  const canCalculate = sessionStatus === "needs_review";
  const canReview = resultStatus === "draft" && resultId !== null;
  const canFinalize =
    (resultStatus === "draft" || resultStatus === "reviewed") && resultId !== null;
  const canOverride = resultStatus === "final";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {canCalculate ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() =>
              void post(`/api/hr/sessions/${sessionId}/calculate`).then((ok) => {
                if (ok) {
                  push("success", "Kalkulasi dijalankan.");
                }
              })
            }
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Coba hitung ulang
          </button>
        ) : null}
        {canReview ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setPending("review")}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Tandai reviewed
          </button>
        ) : null}
        {canFinalize ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setPending("finalize")}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Finalisasi hasil
          </button>
        ) : null}
        {canOverride ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setPending("override")}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--status-warning)] px-5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--status-warning)_10%,white)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Override &amp; hitung ulang
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={pending === "review"}
        title="Tandai hasil sebagai reviewed"
        description="Catatan review tersimpan pada baris hasil dan tercatat di audit log."
        confirmLabel="Simpan review"
        input={{ label: "Catatan review", placeholder: "mis. profil konsisten", required: true }}
        isBusy={isBusy}
        onConfirm={(notes) => {
          setPending(null);
          void post(`/api/hr/results/${resultId}/review`, { notes }).then((ok) => {
            if (ok) {
              push("success", "Hasil ditandai reviewed.");
            }
          });
        }}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === "finalize"}
        title="Finalisasi hasil?"
        description="Setelah final, hasil terkunci dan hanya dapat diubah lewat override beralasan yang teraudit. Laporan PDF baru bisa dibuat setelah final."
        confirmLabel="Finalisasi"
        isBusy={isBusy}
        onConfirm={() => {
          setPending(null);
          void post(`/api/hr/results/${resultId}/finalize`).then((ok) => {
            if (ok) {
              push("success", "Hasil difinalisasi.");
            }
          });
        }}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === "override"}
        title="Override hasil final?"
        description="Hasil final akan ditandai superseded (tetap tersimpan) dan hasil baru dihitung ulang. Alasan wajib dan masuk audit log."
        confirmLabel="Override & hitung ulang"
        tone="danger"
        input={{ label: "Alasan override", placeholder: "mis. kunci GE direvisi", required: true }}
        isBusy={isBusy}
        onConfirm={(overrideReason) => {
          setPending(null);
          void post(`/api/hr/sessions/${sessionId}/calculate`, { overrideReason }).then((ok) => {
            if (ok) {
              push("success", "Override dijalankan; hasil baru berstatus draft.");
            }
          });
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
