"use client";

import { useEffect, useState } from "react";
import { readElapsedSeconds, type ElapsedState } from "@/lib/papi-elapsed.ts";

function format(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Penghitung lama pengerjaan PAPI. Bukan batas waktu.
 *
 * Waktunya dihitung dari sauh di `ElapsedState`, bukan dari jumlah tick yang
 * dikumpulkan komponen ini. Versi sebelumnya menyimpan hitungan tick sendiri
 * dan menyetelnya ulang ke nol setiap kali nilai dari server berubah — dan
 * karena nilai itu ikut datang bersama tiap balasan penyimpanan jawaban,
 * penghitung ter-reset berkali-kali saat peserta menjawab cepat.
 *
 * Menghitung ulang dari sauh juga membuat penghitung tetap benar setelah tab
 * ditinggalkan, saat peramban memperlambat atau menghentikan interval.
 */
export function PapiStopwatch({ elapsed }: { readonly elapsed: ElapsedState }) {
  const [seconds, setSeconds] = useState(elapsed.baselineSeconds);
  const [seenElapsed, setSeenElapsed] = useState(elapsed);

  // Sauh baru dari heartbeat langsung dipakai saat render, bukan lewat efek.
  // `baselineSeconds` dibaca apa adanya — tanpa memanggil jam — supaya render
  // tetap murni; selisih detiknya menyusul pada tick berikutnya.
  if (seenElapsed !== elapsed) {
    setSeenElapsed(elapsed);
    setSeconds(elapsed.baselineSeconds);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      // Jam dibaca di dalam interval, bukan saat render, dan selalu dihitung
      // ulang dari sauh. Karena itu penghitung tetap benar setelah tab
      // ditinggalkan, saat peramban memperlambat atau menghentikan interval.
      setSeconds(readElapsedSeconds(elapsed, Date.now()));
    }, 1000);
    return () => window.clearInterval(timer);
    // Sauh hanya berubah saat heartbeat memajukan waktu, jadi interval
    // dipasang ulang paling sering sekali per 30 detik.
  }, [elapsed]);

  return (
    <div className="flex items-center gap-2">
      <span className="tabular-nums text-sm font-semibold text-foreground" aria-live="off">
        {format(seconds)}
      </span>
      <span className="sr-only">
        Kuesioner ini tidak dibatasi waktu. Penghitung hanya mencatat lama pengerjaan.
      </span>
    </div>
  );
}
