import { ProgressBar } from "@/components/ui/progress-bar";
import { PrototypeBadge } from "@/components/ui/prototype-badge";
import { canSubmitQuestionResponse, type IstQuestion } from "@/lib/ist-questions";

type QuestionStatus = "answered" | "skipped" | "pending";

type QuestionPanelState = {
  readonly question: IstQuestion;
  readonly currentItem: number;
  readonly totalItems: number;
  readonly answeredCount: number;
  readonly status: QuestionStatus;
  readonly value: string;
};

type TestQuestionPanelProps = {
  readonly state: QuestionPanelState;
  readonly onValueChange: (value: string) => void;
  readonly onSkip: () => void;
  readonly onSubmit: () => void;
};

function QuestionControl({
  question,
  value,
  onValueChange,
}: {
  readonly question: IstQuestion;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
}) {
  switch (question.kind) {
    case "choice":
      return (
        <fieldset className="grid gap-3">
          <legend className="sr-only">Pilihan jawaban</legend>
          {question.options.map((option) => {
            const selected = value === option.id;

            return (
              <label
                key={option.id}
                className={`flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-4 transition-colors ${
                  selected
                    ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                    : "border-[var(--border-default)] bg-[var(--surface-panel)] hover:bg-[var(--surface-subtle)]"
                }`}
              >
                <input
                  type="radio"
                  name={`question-${question.globalNumber}`}
                  value={option.id}
                  checked={selected}
                  onChange={(event) => onValueChange(event.target.value)}
                  className="size-4 accent-[var(--accent-primary)]"
                />
                <span className="grid min-w-0 gap-1">
                  <span className="text-xs font-bold uppercase text-[var(--accent-primary)]">
                    Opsi {option.id}
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
    case "short-text":
      return (
        <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
          Jawaban singkat
          <textarea
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            className="min-h-36 w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] px-4 py-4 text-base font-normal text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
            placeholder={question.placeholder}
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
            onChange={(event) => {
              if (/^-?\d*(?:[.,]\d*)?$/.test(event.target.value)) {
                onValueChange(event.target.value);
              }
            }}
            className="h-12 w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] px-4 text-base font-normal text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
            placeholder={question.placeholder}
          />
        </label>
      );
  }

  const exhaustiveCheck: never = question;
  return exhaustiveCheck;
}

export function TestQuestionPanel({
  state,
  onValueChange,
  onSkip,
  onSubmit,
}: TestQuestionPanelProps) {
  const { question, currentItem, totalItems, answeredCount, status, value } = state;
  const statusBadge =
    status === "answered" ? (
      <PrototypeBadge tone="success">Terjawab · bisa diubah</PrototypeBadge>
    ) : status === "skipped" ? (
      <PrototypeBadge tone="warning">Dilewati</PrototypeBadge>
    ) : (
      <PrototypeBadge>Belum dijawab</PrototypeBadge>
    );

  return (
    <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 pb-24 shadow-[var(--shadow-subtle)] xl:flex xl:max-h-[calc(100dvh-9.5rem)] xl:flex-col xl:pb-6">
      <div className="space-y-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
        <div>
          <div className="flex flex-wrap gap-3">
            <PrototypeBadge tone="info">Subtes {question.subtestCode}</PrototypeBadge>
            <PrototypeBadge>
              {currentItem}/{totalItems}
            </PrototypeBadge>
            <PrototypeBadge>Butir global {question.globalNumber}</PrototypeBadge>
            {statusBadge}
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-[-0.04em] text-[var(--text-primary)] sm:text-3xl">
            {question.prompt}
          </h2>
        </div>

        <ProgressBar label="Progres menjawab" value={answeredCount} total={totalItems} />

        <div className="grid gap-5 rounded-xl">
          {question.kind === "choice" && question.visualDescription ? (
            <div className="rounded-xl border border-dashed border-[var(--border-default)] text-sm leading-6 text-[var(--text-secondary)]">
              {question.visualDescription}
            </div>
          ) : null}
          <QuestionControl question={question} value={value} onValueChange={onValueChange} />
        </div>
      </div>

      <div className="fixed inset-x-4 bottom-4 z-40 flex gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-3 shadow-[var(--shadow-elevated)] xl:static xl:inset-auto xl:z-auto xl:mt-6 xl:border-0 xl:p-0 xl:shadow-none">
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex w-1/2 h-12 flex-1 items-center justify-center rounded-xl border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] xl:flex-none"
        >
          Lewati
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmitQuestionResponse(question, value)}
          className="inline-flex w-1/2 h-12 flex-1 items-center justify-center rounded-xl bg-[#4B0D61] px-5 text-sm font-semibold text-white hover:bg-[#3a0a4a] disabled:cursor-not-allowed disabled:opacity-50 xl:flex-none"
        >
          {status === "answered" ? "Perbarui & lanjut" : "Jawab & lanjut"}
        </button>
      </div>
    </article>
  );
}
