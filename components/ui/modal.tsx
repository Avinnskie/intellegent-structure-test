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
        className={`grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden ${size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl"}`}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div
          data-slot="modal-body"
          className="min-h-0 min-w-0 break-words overflow-x-hidden overflow-y-auto overscroll-contain [overflow-wrap:anywhere] [&_button]:max-w-full [&_button]:whitespace-normal"
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
