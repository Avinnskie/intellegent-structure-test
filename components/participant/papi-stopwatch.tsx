"use client";

import { useEffect, useState } from "react";

type PapiStopwatchProps = {
  readonly baselineSeconds: number;
};

function format(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function PapiStopwatch({ baselineSeconds }: PapiStopwatchProps) {
  const [ticks, setTicks] = useState(0);
  const [syncedBaseline, setSyncedBaseline] = useState(baselineSeconds);

  if (syncedBaseline !== baselineSeconds) {
    setSyncedBaseline(baselineSeconds);
    setTicks(0);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTicks((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const seconds = baselineSeconds + ticks;

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
