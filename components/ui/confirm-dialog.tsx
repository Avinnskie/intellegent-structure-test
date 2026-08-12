"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ConfirmDialogProps = {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly tone?: "primary" | "danger";
  readonly input?: { label: string; placeholder?: string; required?: boolean };
  readonly isBusy?: boolean;
  readonly onConfirm: (inputValue: string) => void;
  readonly onCancel: () => void;
};
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "primary",
  input,
  isBusy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [value, setValue] = useState("");
  const [touchedOpen, setTouchedOpen] = useState(open);

  // Setel ulang isian setiap kali dialog dibuka kembali.
  if (touchedOpen !== open) {
    setTouchedOpen(open);
    if (open) {
      setValue("");
    }
  }

  const blocked = isBusy || (input?.required === true && value.trim() === "");

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {input ? (
          <div className="grid gap-2">
            <Label htmlFor="confirm-dialog-input">{input.label}</Label>
            <Input
              id="confirm-dialog-input"
              value={value}
              placeholder={input.placeholder}
              onChange={(event) => setValue(event.target.value)}
              disabled={isBusy}
            />
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBusy}>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={blocked}
            className={cn(
              tone === "danger" &&
                "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20",
            )}
            onClick={(event) => {
              event.preventDefault();
              onConfirm(value);
            }}
          >
            {isBusy ? "Memproses…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
