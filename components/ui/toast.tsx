"use client";

import type { ReactNode } from "react";
import { toast as sonnerToast, Toaster } from "sonner";

export type ToastKind = "success" | "error" | "info";

type ToastContextValue = {
  push: (kind: ToastKind, message: string) => void;
};

/**
 * Pembungkus tipis di atas Sonner. API `useToast().push(kind, message)`
 * dipertahankan supaya seluruh call site lama tetap berjalan tanpa perubahan.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}

const emit: Record<ToastKind, (message: string) => void> = {
  success: (message) => sonnerToast.success(message),
  error: (message) => sonnerToast.error(message),
  info: (message) => sonnerToast.info(message),
};

export function useToast(): ToastContextValue {
  return {
    push: (kind, message) => {
      (emit[kind] ?? sonnerToast)(message);
    },
  };
}
