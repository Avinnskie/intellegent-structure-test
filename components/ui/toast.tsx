"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "success" | "error" | "info";

type Toast = { id: number; kind: ToastKind; message: string };

type ToastContextValue = {
  push: (kind: ToastKind, message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;
const MAX_VISIBLE = 4;

const KIND_STYLES: Record<ToastKind, string> = {
  success: "border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] text-[var(--text-primary)]",
  error:
    "border-[var(--status-error)]/40 bg-[color-mix(in_srgb,var(--status-error)_10%,var(--surface-panel))] text-[var(--status-error)]",
  info: "border-[var(--border-default)] bg-[var(--surface-panel)] text-[var(--text-primary)]",
};

const KIND_ICONS: Record<ToastKind, string> = { success: "✓", error: "✕", info: "ℹ" };

/**
 * App-wide toast stack replacing browser alert-style feedback. Non-blocking, auto-dismissing,
 * announced politely to screen readers; errors use role="alert" so they interrupt.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const nextIdRef = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextIdRef.current++;
      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Bottom-center, anchored with explicit left+right (inset-x-0): `inset-x-auto` tricks made
          the stack fall back to the element's static position (top-left) in Safari. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur ${KIND_STYLES[toast.kind]}`}
          >
            <span aria-hidden="true" className="mt-0.5 text-sm font-bold">
              {KIND_ICONS[toast.kind]}
            </span>
            <p className="min-w-0 flex-1 text-sm font-semibold leading-5">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Tutup notifikasi"
              className="shrink-0 rounded-md px-1 text-sm opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast harus dipakai di dalam <ToastProvider>.");
  }
  return context;
}
