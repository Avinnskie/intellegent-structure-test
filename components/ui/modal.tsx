"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ModalProps = {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;

  readonly size?: "md" | "lg";
  readonly onClose: () => void;
  readonly children: ReactNode;
};

export function Modal({ open, title, description, size = "md", onClose, children }: ModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent
        className={`max-h-[90dvh] overflow-y-auto ${size === "lg" ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
