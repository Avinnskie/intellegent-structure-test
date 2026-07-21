"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Command as CommandPrimitive } from "cmdk";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type TagsInputProps = {
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly maxTags?: number;
  readonly maxLength?: number;
  readonly id?: string;
  readonly className?: string;
};

function isDuplicate(list: readonly string[], candidate: string): boolean {
  const normalized = candidate.toLowerCase();
  return list.some((entry) => entry.toLowerCase() === normalized);
}

export function TagsInput({
  value,
  onChange,
  placeholder = "Tambah frasa…",
  disabled,
  maxTags,
  maxLength = 120,
  id,
  className,
}: TagsInputProps) {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");

  const atCapacity = typeof maxTags === "number" && value.length >= maxTags;
  const trimmed = input.trim();
  const canCreate = trimmed.length > 0 && !isDuplicate(value, trimmed) && !atCapacity;

  function commit(next: string) {
    const clean = next.trim();
    if (!clean || isDuplicate(value, clean) || atCapacity) {
      return;
    }
    onChange([...value, clean]);
    setInput("");
  }

  function removeAt(index: number) {
    const next = value.slice();
    next.splice(index, 1);
    onChange(next);
  }

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        className={cn(
          "flex min-h-11 w-full min-w-0 max-w-full cursor-text flex-wrap items-center gap-1.5 overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] px-2 py-1.5 text-left text-sm text-[var(--text-primary)] transition-colors",
          "focus-within:border-[var(--accent-primary)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]",
          disabled && "cursor-not-allowed opacity-60",
          className,
        )}
      >
        {value.length === 0 ? (
          <span className="px-1 text-sm font-normal text-[var(--text-muted)]">{placeholder}</span>
        ) : (
          value.map((tag, index) => (
            <Badge
              key={`${tag}-${index}`}
              variant="secondary"
              className="h-6 gap-1 px-2 py-0.5 text-xs font-normal"
            >
              <span className="max-w-[16ch] truncate">{tag}</span>
              {!disabled ? (
                <span
                  role="button"
                  aria-label={`Hapus ${tag}`}
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    removeAt(index);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      removeAt(index);
                    }
                  }}
                  className="ml-0.5 inline-flex size-3.5 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
                >
                  <X className="size-3" />
                </span>
              ) : null}
            </Badge>
          ))
        )}
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[280px] max-w-[calc(100dvw-1rem)] p-0"
      >
        <Command shouldFilter={false} className="rounded-xl">
          <div className="border-b border-[var(--border-default)] p-2">
            <CommandPrimitive.Input
              autoFocus
              value={input}
              onValueChange={setInput}
              placeholder={atCapacity ? "Batas maksimum tercapai" : placeholder}
              maxLength={maxLength}
              disabled={disabled || atCapacity}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (canCreate) {
                    commit(trimmed);
                  }
                  return;
                }
                if (event.key === "Backspace" && input.length === 0 && value.length > 0) {
                  event.preventDefault();
                  removeAt(value.length - 1);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                }
              }}
              className="h-8 w-full rounded-md bg-transparent px-2 text-sm outline-none placeholder:text-[var(--text-muted)]"
            />
          </div>
          <CommandList className="max-h-56">
            {canCreate ? (
              <CommandGroup heading="Tambah baru">
                <CommandItem
                  value={trimmed}
                  onSelect={() => commit(trimmed)}
                  className="cursor-pointer"
                >
                  + Tambah &ldquo;{trimmed}&rdquo;
                </CommandItem>
              </CommandGroup>
            ) : null}
            {value.length > 0 ? (
              <CommandGroup heading={`Frasa aktif (${value.length})`}>
                {value.map((tag, index) => (
                  <CommandItem
                    key={`${tag}-active-${index}`}
                    value={`__existing_${index}_${tag}`}
                    onSelect={() => removeAt(index)}
                    className="cursor-pointer justify-between text-[var(--text-secondary)]"
                  >
                    <span className="truncate">{tag}</span>
                    <span className="text-xs text-[var(--text-muted)]">hapus</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {!canCreate && value.length === 0 ? (
              <CommandEmpty>Ketik frasa lalu tekan Enter.</CommandEmpty>
            ) : null}
            {!canCreate && trimmed.length > 0 && isDuplicate(value, trimmed) ? (
              <CommandEmpty>Frasa sudah ada.</CommandEmpty>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
