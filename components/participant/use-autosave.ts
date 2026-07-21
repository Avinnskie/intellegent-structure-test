"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "menyimpan" | "tersimpan" | "gagal";

const DEBOUNCE_MS = 800;
const RETRY_DELAY_MS = 2000;

/**
 * Debounced autosave against the T14 PUT endpoint, with one retry.
 *
 * The endpoint is idempotent by contract, so re-sending the same value is always safe — which is
 * why the retry needs no bookkeeping beyond "try once more". A save that ultimately fails surfaces
 * as `"gagal"` for the indicator and nothing else: the participant's typed value is still on their
 * screen, and the next keystroke or the explicit "Jawab & lanjut" re-sends it.
 *
 * A generation counter guards the async gaps: a save that lands after a newer save started must not
 * overwrite the newer status. `flush` exists for the submit button — it bypasses the debounce and
 * REUSES the same generation stream so a stale debounce tick cannot fire after an explicit save.
 */
export function useAutosave(saveUrl: string) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const generationRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  const clearDebounce = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const performSave = useCallback(
    async (value: string, generation: number): Promise<boolean> => {
      const attempt = async (): Promise<boolean> => {
        const response = await fetch(saveUrl, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value, clientTimestamp: new Date().toISOString() }),
        });
        return response.ok;
      };

      try {
        if (await attempt()) {
          return true;
        }
      } catch {
        // Network failure falls through to the retry below.
      }

      await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS));
      if (generation !== generationRef.current) {
        // A newer save superseded this one while it waited; its outcome no longer matters.
        return false;
      }
      try {
        return await attempt();
      } catch {
        return false;
      }
    },
    [saveUrl],
  );

  const save = useCallback(
    async (value: string): Promise<boolean> => {
      clearDebounce();
      const generation = ++generationRef.current;
      setStatus("menyimpan");

      const saved = await performSave(value, generation);
      if (generation === generationRef.current) {
        setStatus(saved ? "tersimpan" : "gagal");
      }
      return saved;
    },
    [clearDebounce, performSave],
  );

  const queueSave = useCallback(
    (value: string) => {
      clearDebounce();
      debounceRef.current = window.setTimeout(() => {
        void save(value);
      }, DEBOUNCE_MS);
    },
    [clearDebounce, save],
  );

  useEffect(() => clearDebounce, [clearDebounce]);

  return { status, queueSave, flush: save };
}
