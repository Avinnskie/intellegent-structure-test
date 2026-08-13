"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SubtestCode } from "@/lib/ist-subtests";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.";

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
        // `replace`, bukan `push`. Subtes yang sudah ditutup tidak dapat
        // dibuka lagi, jadi halaman soalnya tidak boleh tertinggal di riwayat —
        // tombol back peramban akan menampilkannya kembali dari cache klien,
        // lengkap dengan tombol jawab yang sudah tidak berlaku.
        if (dto.sessionStatus === "finished") {
          router.replace(`/test/${token}/complete`);
          return;
        }
        router.replace(`/test/${token}/transition`);
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
    <div className="space-y-3 w-full">
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
        onClick={() => void handleComplete()}
        disabled={isCompleting}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
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
