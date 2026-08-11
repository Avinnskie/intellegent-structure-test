"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "menyimpan" | "tersimpan" | "gagal";

const DEBOUNCE_MS = 800;
const RETRY_DELAY_MS = 2000;

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
      } catch {}

      await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS));
      if (generation !== generationRef.current) {
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
