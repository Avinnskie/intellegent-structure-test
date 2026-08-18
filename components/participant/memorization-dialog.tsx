"use client";

import { useEffect, useState } from "react";
import { RichText } from "@/components/ui/rich-text";
import {
  formatCountdown,
  MEMORIZATION_SECONDS,
  memorizationRemaining,
} from "@/lib/memorization.ts";

/**
 * Tahap menghafal subtes ME.
 *
 * Sengaja BUKAN dialog biasa: tidak ada tombol tutup, tidak bisa ditutup dengan
 * Escape, dan tidak menutup saat latar diklik. Daftar kata harus tampil selama
 * tiga menit penuh lalu hilang dengan sendirinya — kalau peserta bisa
 * menutupnya lebih awal dan membukanya lagi, subtes ini kehilangan maknanya.
 *
 * Sisa waktu dihitung dari selisih cap waktu, bukan akumulasi tick, sehingga
 * berpindah tab tidak memperpanjang waktu menghafal.
 */
export function MemorizationDialog({
  content,
  onFinished,
  remainingSeconds,
  totalSeconds = MEMORIZATION_SECONDS,
}: {
  readonly content: string;
  readonly onFinished: () => void;
  /**
   * Sisa waktu menurut SERVER saat dialog dibuka.
   *
   * Sengaja bukan `Date.now()` di klien. Menyauh di klien membuat setiap
   * refresh memberi tiga menit baru, dan peserta dapat mengulanginya tanpa
   * batas.
   */
  readonly remainingSeconds: number;
  readonly totalSeconds?: number;
}) {
  // Sauh lokal dihitung mundur DARI sisa waktu server, bukan dari nol.
  const [anchorMs] = useState(() => Date.now());
  const [remaining, setRemaining] = useState(remainingSeconds);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const left = memorizationRemaining(anchorMs, Date.now(), remainingSeconds);
      setRemaining(left);
      if (left === 0) {
        window.clearInterval(timer);
        onFinished();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [anchorMs, remainingSeconds, onFinished]);

  const urgent = remaining <= 30;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="memorization-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-4 py-8 backdrop-blur-sm"
    >
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="memorization-title" className="text-lg font-bold text-foreground">
            Waktunya menghafal
          </h2>
          <span
            aria-live="polite"
            aria-atomic="true"
            className={`rounded-full px-4 py-1.5 text-base font-bold tabular-nums ${
              urgent ? "bg-destructive/10 text-destructive" : "bg-accent text-primary"
            }`}
          >
            {formatCountdown(remaining)}
          </span>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-muted p-5">
          <RichText value={content} className="text-base leading-8 text-foreground" />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Soal akan terbuka setelah waktu menghafal habis.
        </p>
      </div>
    </div>
  );
}
