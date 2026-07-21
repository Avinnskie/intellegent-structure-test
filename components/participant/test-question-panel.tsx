import { ProgressBar } from "@/components/ui/progress-bar";
import type { SubtestCode } from "@/lib/ist-subtests";

/**
 * Mirrors `StartSubtestItem` (T13) — the participant-safe projection of one question. There is no
 * field for a scoring rule or a correct answer, and this component must never grow one.
 */
export type QuestionItem = {
  readonly itemVersionId: string;
  readonly itemNumber: number;
  readonly localNumber: number;
  readonly itemType: "choice" | "short_text" | "numeric";
  readonly prompt: string;
  readonly options: readonly { optionCode: string; label: string }[];
  readonly placeholder: string | null;
  /** Storage path (opaque to the client); the PAGE converts it to a signed URL. */
  readonly mediaReference?: string | null;
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
  /** Signed URL of the question's image (already minted server-side); null = none. */
  readonly mediaUrl?: string | null;
  /** True while an answer/skip is in flight — every input and button locks until the next item. */
  readonly disabled?: boolean;
  readonly onValueChange: (value: string) => void;
  readonly onSkip: () => void;
  readonly onSubmit: () => void;
};

/** A submittable answer: chosen option, or non-empty text/number. The server re-validates anyway. */
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
                    ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                    : `border-[var(--border-default)] bg-[var(--surface-panel)] ${disabled ? "" : "hover:bg-[var(--surface-subtle)]"}`
                }`}
              >
                <input
                  type="radio"
                  name={`question-${item.itemNumber}`}
                  value={option.optionCode}
                  checked={selected}
                  onChange={(event) => onValueChange(event.target.value)}
                  className="size-4 accent-[var(--accent-primary)]"
                />
                <span className="grid min-w-0 gap-1">
                  <span className="text-xs font-bold uppercase text-[var(--accent-primary)]">
                    Opsi {option.optionCode}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {option.label}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      );
    case "short_text":
      return (
        <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
          Jawaban singkat
          <textarea
            value={value}
            disabled={disabled}
            onChange={(event) => onValueChange(event.target.value)}
            className="min-h-36 w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] px-4 py-4 text-base font-normal text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
            placeholder={item.placeholder ?? undefined}
            maxLength={500}
          />
        </label>
      );
    case "numeric":
      return (
        <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
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
            className="h-12 w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] px-4 text-base font-normal text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
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
    <article className="rounded-2xl h-full border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 pb-24 xl:flex xl:h-[calc(100dvh-2.5rem)] xl:flex-col xl:pb-6">
      <div className="space-y-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-[var(--accent-primary)]">
              Subtes {subtestCode}
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--border-default)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
              {item.localNumber}/{totalItems}
            </span>
            {autosaveLabel ? (
              <span aria-live="polite" className="text-xs font-semibold text-[var(--text-muted)]">
                {autosaveLabel}
              </span>
            ) : null}
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-[-0.04em] text-[var(--text-primary)] sm:text-3xl">
            {item.prompt}
          </h2>
        </div>

        <ProgressBar label="Progres menjawab" value={answeredCount} total={totalItems} />

        {mediaUrl ? (
          <div className="overflow-hidden rounded-xl border border-[var(--border-default)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, next/image cannot optimize it */}
            <img
              src={mediaUrl}
              alt={`Gambar soal ${item.localNumber}`}
              className="max-h-80 w-full object-contain bg-[var(--surface-base)]"
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

      <div className="fixed inset-x-4 bottom-4 z-40 flex gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-3 xl:static xl:inset-auto xl:z-auto xl:mt-6 xl:border-0 xl:p-0 xl:shadow-none">
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          className="inline-flex w-1/2 h-12 flex-1 items-center justify-center rounded-xl border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50 xl:flex-none"
        >
          Lewati
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !canSubmitValue(item, value)}
          className="inline-flex w-1/2 h-12 flex-1 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50 xl:flex-none"
        >
          {status === "answered" ? "Perbarui & lanjut" : "Jawab & lanjut"}
        </button>
      </div>
    </article>
  );
}
