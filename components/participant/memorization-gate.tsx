"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { MemorizationDialog } from "@/components/participant/memorization-dialog";
import { formatCountdown, MEMORIZATION_SECONDS } from "@/lib/memorization.ts";
import type { SubtestCode } from "@/lib/ist-subtests";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.";

/**
 * Pengganti tombol mulai untuk subtes ME.
 *
 * Urutannya: peserta menekan tombol -> daftar kata tampil dengan hitung mundur
 * tiga menit -> waktu habis, daftar hilang -> subtes langsung dibuka.
 *
 * Subtes dibuka OTOMATIS setelah menghafal, bukan lewat tombol kedua. Kalau
 * peserta harus menekan tombol lagi, ia bisa menunda selama apa pun sesudah
 * menghafal — atau lebih buruk, kembali membaca halaman tutorial yang masih
 * memuat daftar kata yang sama.
 */
export function MemorizationGate({
  token,
  code,
  content,
}: {
  readonly token: string;
  readonly code: SubtestCode;
  readonly content: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "meminta" | "menghafal" | "membuka">("idle");
  const [remainingSeconds, setRemainingSeconds] = useState(MEMORIZATION_SECONDS);
  const [error, setError] = useState<string | null>(null);

  const openSubtest = useCallback(async () => {
    setPhase("membuka");
    setError(null);
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(token)}/subtests/${code}/start`,
        { method: "POST" },
      );
      if (response.ok) {
        router.replace(`/test/${token}/question/${code}/1`);
        return;
      }
      if (response.status === 409 || response.status === 401) {
        router.refresh();
        return;
      }
      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      setError(envelope.error?.message ?? NETWORK_ERROR_MESSAGE);
      setPhase("idle");
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
      setPhase("idle");
    }
  }, [router, token, code]);

  /**
   * Meminta sauh waktu ke server sebelum dialog dibuka.
   *
   * Server menulis waktu mulai hanya sekali, jadi peserta yang menyegarkan
   * halaman menerima SISA waktu yang sebenarnya — bukan tiga menit baru.
   */
  const mulaiMenghafal = useCallback(async () => {
    setPhase("meminta");
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(token)}/memorization`, {
        method: "POST",
      });
      if (!response.ok) {
        setError(NETWORK_ERROR_MESSAGE);
        setPhase("idle");
        return;
      }
      const dto = (await response.json()) as { remainingSeconds: number };
      if (dto.remainingSeconds <= 0) {
        // Waktu sudah habis di kunjungan sebelumnya — langsung ke soal.
        await openSubtest();
        return;
      }
      setRemainingSeconds(dto.remainingSeconds);
      setPhase("menghafal");
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
      setPhase("idle");
    }
  }, [token, openSubtest]);

  return (
    <div className="w-full space-y-3">
      {phase === "menghafal" ? (
        <MemorizationDialog
          content={content}
          remainingSeconds={remainingSeconds}
          onFinished={() => void openSubtest()}
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-sm leading-6 text-destructive">
          {error}
        </p>
      ) : null}

      <p className="text-sm leading-6 text-muted-foreground">
        Subtes {code} dimulai dengan tahap menghafal selama{" "}
        <strong className="font-semibold text-foreground">
          {formatCountdown(MEMORIZATION_SECONDS)}
        </strong>
        . Setelah waktu itu habis, daftar kata hilang dan soal langsung terbuka. Pastikan Anda siap
        sebelum menekan tombol.
      </p>

      <button
        type="button"
        onClick={() => void mulaiMenghafal()}
        disabled={phase !== "idle"}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {phase === "membuka"
          ? "Membuka soal…"
          : phase === "meminta"
            ? "Menyiapkan…"
            : "Mulai menghafal"}
      </button>
    </div>
  );
}
