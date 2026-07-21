"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SubtestCode } from "@/lib/ist-subtests";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.";

/**
 * "Selesaikan subtes" — the irreversible hand-in (spec §10: no way back afterwards).
 *
 * On success it follows the DTO: mid-test goes to the transition screen; after ME (`finished`) it
 * lands straight on the closing page — closing ME already calculated the result server-side, so
 * there is no acknowledgement left to send. A 409/410 — double press, timeout racing the click,
 * another tab got there first — is not an error to show: the session HAS moved, so the button
 * refreshes and lets the server page route wherever it now belongs.
 */
export function CompleteSubtestButton({
  token,
  code,
  unansweredCount,
}: {
  token: string;
  code: SubtestCode;
  unansweredCount: number;
}) {
  const router = useRouter();
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleComplete() {
    if (isCompleting) {
      return;
    }
    setIsCompleting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(token)}/subtests/${code}/complete`,
        { method: "POST" },
      );

      if (response.ok) {
        const dto = (await response.json()) as { sessionStatus?: string };
        if (dto.sessionStatus === "finished") {
          router.push(`/test/${token}/complete`);
          return;
        }
        router.push(`/test/${token}/transition`);
        return;
      }

      if (response.status === 409 || response.status === 410 || response.status === 401) {
        router.refresh();
        return;
      }

      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      setError(envelope.error?.message ?? NETWORK_ERROR_MESSAGE);
      setIsCompleting(false);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
      setIsCompleting(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--status-error)]/30 bg-[color-mix(in_srgb,var(--status-error)_8%,white)] px-4 py-3 text-sm leading-6 text-[var(--status-error)]"
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleComplete}
        disabled={isCompleting}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isCompleting
          ? "Menutup subtes…"
          : unansweredCount > 0
            ? `Selesaikan subtes ${code} (${unansweredCount} belum dijawab)`
            : `Selesaikan subtes ${code}`}
      </button>
    </div>
  );
}
