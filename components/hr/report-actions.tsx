"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Coba lagi.";

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
      <Button
        type="button"
        onClick={handleGenerate}
        disabled={isBusy}
        aria-busy={isBusy}
        size="lg"
        className="h-11 px-4"
      >
        {isBusy ? (
          <LoaderCircle className="animate-spin" data-icon="inline-start" />
        ) : (
          <FileText data-icon="inline-start" />
        )}
        {isBusy ? "Membuat PDF…" : "Generate laporan PDF"}
      </Button>
      {isBusy ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
        >
          <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-primary" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-foreground">Laporan sedang disiapkan</p>
            <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
              Data hasil sedang dirangkum dan dirender menjadi PDF. Jangan tutup halaman ini.
            </p>
          </div>
        </div>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--destructive)]/30 bg-[color-mix(in_srgb,var(--destructive)_8%,white)] px-4 py-3 text-sm leading-6 text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
