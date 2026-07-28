"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setValue("");
    }
  }

  const isConfirmDisabled = isBusy || (input?.required === true && value.trim() === "");

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent className="overflow-hidden sm:max-w-md">
        <form
          className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isConfirmDisabled) {
              onConfirm(value.trim());
            }
          }}
        >
          <div className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>

            {input ? (
              <div className="mt-4 grid min-w-0 gap-2">
                <Label htmlFor="confirm-dialog-input">
                  {input.label}
                  {input.required ? <span className="sr-only">(wajib)</span> : null}
                </Label>
                <Input
                  id="confirm-dialog-input"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={input.placeholder}
                  maxLength={500}
                  autoFocus
                />
              </div>
            ) : null}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" disabled={isBusy} onClick={onCancel}>
              Batal
            </Button>
            <Button
              type="submit"
              variant={tone === "danger" ? "destructive" : "default"}
              disabled={isConfirmDisabled}
            >
              {isBusy ? "Memproses…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
