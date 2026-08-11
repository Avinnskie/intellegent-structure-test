"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SubtestCode } from "@/lib/ist-subtests";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.";

export function StartSubtestButton({ token, code }: { token: string; code: SubtestCode }) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (isStarting) {
      return;
    }
    setIsStarting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(token)}/subtests/${code}/start`,
        { method: "POST" },
      );

      if (response.ok) {
        router.push(`/test/${token}/question/${code}/1`);
        return;
      }

      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      if (response.status === 409 || response.status === 401) {
        router.refresh();
        return;
      }
      setError(envelope.error?.message ?? NETWORK_ERROR_MESSAGE);
      setIsStarting(false);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
      setIsStarting(false);
    }
  }

  return (
    <div className="mt-6 space-y-3 w-full">
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--destructive)]/30 bg-[color-mix(in_srgb,var(--destructive)_8%,white)] px-4 py-3 text-sm leading-6 text-destructive"
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleStart}
        disabled={isStarting}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isStarting ? "Memulai…" : `Mulai subtes ${code}`}
      </button>
    </div>
  );
}
