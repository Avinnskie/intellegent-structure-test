"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Coba lagi.";

/** Generates a new versioned PDF for a final result, then refreshes the history table. */
export function GenerateReportButton({ resultId }: { resultId: string }) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/hr/results/${resultId}/report`, { method: "POST" });
      if (response.ok) {
        router.refresh();
        return;
      }
      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      setError(envelope.error?.message ?? NETWORK_ERROR_MESSAGE);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isBusy}
        className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isBusy ? "Membuat PDF…" : "Generate laporan PDF"}
      </button>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--status-error)]/30 bg-[color-mix(in_srgb,var(--status-error)_8%,white)] px-4 py-3 text-sm leading-6 text-[var(--status-error)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
