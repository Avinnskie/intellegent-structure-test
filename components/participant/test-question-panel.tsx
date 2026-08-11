import { ProgressBar } from "@/components/ui/progress-bar";
import { RichText } from "@/components/ui/rich-text";
import type { SubtestCode } from "@/lib/ist-subtests";

export type QuestionItem = {
  readonly itemVersionId: string;
  readonly itemNumber: number;
  readonly localNumber: number;
  readonly itemType: "choice" | "short_text" | "numeric";
  readonly prompt: string;
  readonly options: readonly { optionCode: string; label: string }[];
  readonly placeholder: string | null;
  readonly mediaReference?: string | null;
  readonly savedValue?: string | null;
};

type QuestionStatus = "answered" | "skipped" | "pending";

type QuestionPanelState = {
  readonly subtestCode: SubtestCode;
  readonly item: QuestionItem;
  readonly totalItems: number;
  readonly answeredCount: number;
  readonly status: QuestionStatus;
  readonly value: string;
};

type TestQuestionPanelProps = {
  readonly state: QuestionPanelState;
  readonly autosaveLabel: string | null;
  readonly mediaUrl?: string | null;
  readonly disabled?: boolean;
  readonly onValueChange: (value: string) => void;
  readonly onSkip: () => void;
  readonly onSubmit: () => void;
};

export function canSubmitValue(item: QuestionItem, value: string): boolean {
  if (item.itemType === "choice") {
    return item.options.some((option) => option.optionCode === value);
  }
  return value.trim() !== "";
}

function QuestionControl({
  item,
  value,
  disabled,
  onValueChange,
}: {
  readonly item: QuestionItem;
  readonly value: string;
  readonly disabled: boolean;
  readonly onValueChange: (value: string) => void;
}) {
  switch (item.itemType) {
    case "choice":
      return (
        <fieldset className="grid gap-3" disabled={disabled}>
          <legend className="sr-only">Pilihan jawaban</legend>
          {item.options.map((option) => {
            const selected = value === option.optionCode;

            return (
              <label
                key={option.optionCode}
                className={`flex items-center gap-4 rounded-xl border px-4 py-4 transition-colors ${
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                } ${
                  selected
                    ? "border-primary bg-accent"
                    : `border-border bg-card ${disabled ? "" : "hover:bg-muted"}`
                }`}
              >
                <input
                  type="radio"
                  name={`question-${item.itemNumber}`}
                  value={option.optionCode}
                  checked={selected}
                  onChange={(event) => onValueChange(event.target.value)}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="grid min-w-0 gap-1">
                  <span className="text-xs font-bold uppercase text-primary">
                    Opsi {option.optionCode}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{option.label}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      );
    case "short_text":
      return (
        <label className="grid gap-2 text-sm font-semibold text-foreground">
          Jawaban singkat
          <textarea
            value={value}
            disabled={disabled}
            onChange={(event) => onValueChange(event.target.value)}
            className="min-h-36 w-full rounded-xl border border-border bg-card px-4 py-4 text-base font-normal text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            placeholder={item.placeholder ?? undefined}
            maxLength={500}
          />
        </label>
      );
    case "numeric":
      return (
        <label className="grid gap-2 text-sm font-semibold text-foreground">
          Jawaban angka
          <input
            type="text"
            inputMode="decimal"
            value={value}
            disabled={disabled}
            onChange={(event) => {
              if (/^-?\d*(?:[.,]\d*)?$/.test(event.target.value)) {
                onValueChange(event.target.value);
              }
            }}
            className="h-12 w-full rounded-xl border border-border bg-card px-4 text-base font-normal text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            placeholder={item.placeholder ?? undefined}
            maxLength={64}
          />
        </label>
      );
  }
}

export function TestQuestionPanel({
  state,
  autosaveLabel,
  mediaUrl = null,
  disabled = false,
  onValueChange,
  onSkip,
  onSubmit,
}: TestQuestionPanelProps) {
  const { subtestCode, item, totalItems, answeredCount, status, value } = state;

  return (
    // 2.5rem = the test layout's p-5 top+bottom; the old 9.5rem offset assumed a header that the
    // participant layout no longer has, which left a dead band under the card.
    <article className="rounded-xl h-full border border-border bg-card p-6 pb-24 xl:flex xl:h-[calc(100dvh-2.5rem)] xl:flex-col xl:pb-6">
      <div className="space-y-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-primary">
              Subtes {subtestCode}
            </span>
            <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
              {item.localNumber}/{totalItems}
            </span>
            {autosaveLabel ? (
              <span aria-live="polite" className="text-xs font-semibold text-muted-foreground">
                {autosaveLabel}
              </span>
            ) : null}
          </div>
          {/*
            Teks soal ditulis HR lewat editor berformat, jadi ia dirender sebagai
            HTML yang sudah dibersihkan — bukan teks polos. Sebelumnya baris baru
            hilang dan penebalan tidak muncul sama sekali.

            `RichText` mengatur ukuran per tingkat judul di dalamnya, jadi bungkus
            luar ini hanya menetapkan ukuran dasar.
          */}
          <div className="mt-4 text-2xl font-bold tracking-[-0.04em] text-foreground sm:text-3xl">
            <RichText value={item.prompt} />
          </div>
        </div>

        <ProgressBar label="Progres menjawab" value={answeredCount} total={totalItems} />

        {mediaUrl ? (
          <div className="overflow-hidden rounded-xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, next/image cannot optimize it */}
            <img
              src={mediaUrl}
              alt={`Gambar soal ${item.localNumber}`}
              className="max-h-80 w-full object-contain bg-background"
            />
          </div>
        ) : null}

        <div className="grid gap-5 rounded-xl px-2">
          <QuestionControl
            item={item}
            value={value}
            disabled={disabled}
            onValueChange={onValueChange}
          />
        </div>
      </div>

      <div className="fixed inset-x-4 bottom-4 z-40 flex gap-3 rounded-xl border border-border bg-card p-3 xl:static xl:inset-auto xl:z-auto xl:mt-6 xl:border-0 xl:p-0 xl:shadow-none">
        {/* <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          className="inline-flex w-1/2 h-12 flex-1 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 xl:flex-none"
        >
          Lewati
        </button> */}
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !canSubmitValue(item, value)}
          className="inline-flex w-full h-12 flex-1 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 xl:flex-none"
        >
          {status === "answered" ? "Perbarui & lanjut" : "Jawab & lanjut"}
        </button>
      </div>
    </article>
  );
}
