"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "menyimpan" | "tersimpan" | "gagal";

const DEBOUNCE_MS = 350;
const RETRY_DELAY_MS = 2000;
type SaveAttempt = "saved" | "retry" | "rejected";
type PendingSave = { readonly key: string; readonly promise: Promise<boolean> };

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useAutosave(saveUrl: string) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const generationRef = useRef(0);
  const debounceRef = useRef<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const pendingSaveRef = useRef<PendingSave | null>(null);
  const lastSavedKeyRef = useRef<string | null>(null);

  const clearDebounce = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const performSave = useCallback(
    async (value: string, generation: number): Promise<boolean> => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;

      const attempt = async (): Promise<SaveAttempt> => {
        const response = await fetch(saveUrl, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value, clientTimestamp: new Date().toISOString() }),
          signal: controller.signal,
        });
        if (response.ok) {
          return "saved";
        }
        return response.status >= 500 ? "retry" : "rejected";
      };

      try {
        try {
          const result = await attempt();
          if (result !== "retry") {
            return result === "saved";
          }
        } catch (error) {
          if (isAbortError(error)) {
            return false;
          }
          // Kegagalan jaringan sementara mendapat satu kesempatan ulang.
        }

        await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS));
        if (generation !== generationRef.current || controller.signal.aborted) {
          return false;
        }
        try {
          return (await attempt()) === "saved";
        } catch {
          return false;
        }
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
        }
      }
    },
    [saveUrl],
  );

  const save = useCallback(
    async (value: string): Promise<boolean> => {
      clearDebounce();
      const key = `${saveUrl}\u0000${value}`;

      if (lastSavedKeyRef.current === key) {
        setStatus("tersimpan");
        return true;
      }

      const pending = pendingSaveRef.current;
      if (pending?.key === key) {
        return pending.promise;
      }

      const generation = ++generationRef.current;
      setStatus("menyimpan");

      const promise = performSave(value, generation);
      pendingSaveRef.current = { key, promise };
      const saved = await promise;
      if (pendingSaveRef.current?.promise === promise) {
        pendingSaveRef.current = null;
      }
      if (generation === generationRef.current) {
        if (saved) {
          lastSavedKeyRef.current = key;
        }
        setStatus(saved ? "tersimpan" : "gagal");
      }
      return saved;
    },
    [clearDebounce, performSave, saveUrl],
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

  useEffect(
    () => () => {
      clearDebounce();
      requestRef.current?.abort();
      requestRef.current = null;
      pendingSaveRef.current = null;
    },
    [clearDebounce],
  );

  return { status, queueSave, flush: save };
}
