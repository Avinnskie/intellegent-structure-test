"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SubtestCode } from "@/lib/ist-subtests";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.";

/**
 * "Mulai subtes": POSTs the start endpoint, then navigates to the first question.
 *
 * The endpoint is idempotent by design (T13) — a double click or a retry resumes the SAME attempt
 * with the SAME deadline, so this button never needs to fear creating a second timer. On a state
 * error (session advanced in another tab, admin pause) it refreshes the route instead of guessing:
 * the server page re-reads `nextRoute` and redirects wherever the participant now belongs.
 */
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
      // WRONG_SUBTEST / SUBTEST_LOCKED / SESSION_NOT_ACTIVE all mean "this page is stale":
      // let the server component re-resolve where the participant belongs.
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
          className="rounded-xl border border-[var(--status-error)]/30 bg-[color-mix(in_srgb,var(--status-error)_8%,white)] px-4 py-3 text-sm leading-6 text-[var(--status-error)]"
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleStart}
        disabled={isStarting}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isStarting ? "Memulai…" : `Mulai subtes ${code}`}
      </button>
    </div>
  );
}
