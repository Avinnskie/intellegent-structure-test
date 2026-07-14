"use client";

import { useMemo, useState } from "react";
import { PrototypeBadge } from "@/components/ui/prototype-badge";
import { questionsBySubtest } from "@/lib/ist-questions";
import { SUBTEST_CODES, subtests, type QuestionKind, type SubtestCode } from "@/lib/ist-subtests";

type DraftStatus = "published" | "draft" | "in_review";

type EditableSubtest = {
  readonly code: SubtestCode;
  readonly publishedVersion: string;
  readonly draftVersion: string;
  readonly status: DraftStatus;
  readonly title: string;
  readonly durationMinutes: number;
  readonly questionKind: QuestionKind;
};

type EditableQuestion = {
  readonly id: string;
  readonly localNumber: number;
  readonly kind: QuestionKind;
  readonly prompt: string;
  readonly responseConfig: string;
};

function createSubtestMap(): Record<SubtestCode, EditableSubtest> {
  return Object.fromEntries(
    subtests.map((subtest) => [
      subtest.code,
      {
        code: subtest.code,
        publishedVersion: `SUB-${subtest.code}-2026.07`,
        draftVersion: `DRAFT-${subtest.code}-2026.07.2`,
        status: "published",
        title: subtest.title,
        durationMinutes: subtest.durationMinutes,
        questionKind: subtest.questionKind,
      },
    ]),
  ) as Record<SubtestCode, EditableSubtest>;
}

function createQuestionMap(): Record<SubtestCode, EditableQuestion[]> {
  return Object.fromEntries(
    SUBTEST_CODES.map((code) => [
      code,
      questionsBySubtest[code].map((question) => ({
        id: `${code}-${question.localNumber}`,
        localNumber: question.localNumber,
        kind: question.kind,
        prompt: question.prompt,
        responseConfig:
          question.kind === "choice"
            ? question.options.map((option) => option.label).join(" | ")
            : question.placeholder,
      })),
    ]),
  ) as Record<SubtestCode, EditableQuestion[]>;
}

function isSubtestCode(value: string): value is SubtestCode {
  return SUBTEST_CODES.some((code) => code === value);
}

function isQuestionKind(value: string): value is QuestionKind {
  return value === "choice" || value === "short-text" || value === "numeric";
}

function statusLabel(status: DraftStatus) {
  if (status === "draft") return "Draft";
  if (status === "in_review") return "Dalam review";
  return "Published";
}

export function QuestionBankEditor() {
  const [selectedCode, setSelectedCode] = useState<SubtestCode>("SE");
  const [subtestsByCode, setSubtestsByCode] = useState(createSubtestMap);
  const [questionsByCode, setQuestionsByCode] = useState(createQuestionMap);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedSubtest = subtestsByCode[selectedCode];
  const selectedQuestions = questionsByCode[selectedCode];
  const canEdit = selectedSubtest.status === "draft";
  const totalQuestions = useMemo(
    () => SUBTEST_CODES.reduce((total, code) => total + questionsByCode[code].length, 0),
    [questionsByCode],
  );

  function updateSubtest(updates: Partial<Pick<EditableSubtest, "title" | "durationMinutes">>) {
    setSubtestsByCode((current) => ({
      ...current,
      [selectedCode]: { ...current[selectedCode], ...updates },
    }));
  }

  function createDraft() {
    setSubtestsByCode((current) => ({
      ...current,
      [selectedCode]: { ...current[selectedCode], status: "draft" },
    }));
    setNotice(`Draft ${selectedSubtest.draftVersion} dibuat dari versi published.`);
  }

  function updateQuestion(questionId: string, updates: Partial<EditableQuestion>) {
    setQuestionsByCode((current) => ({
      ...current,
      [selectedCode]: current[selectedCode].map((question) =>
        question.id === questionId ? { ...question, ...updates } : question,
      ),
    }));
  }

  function addQuestion() {
    const nextNumber = selectedQuestions.length + 1;
    const newQuestion: EditableQuestion = {
      id: `${selectedCode}-draft-${nextNumber}`,
      localNumber: nextNumber,
      kind: selectedSubtest.questionKind,
      prompt: `Soal dummy baru ${nextNumber}. Perbarui prompt sebelum diajukan untuk review.`,
      responseConfig:
        selectedSubtest.questionKind === "choice"
          ? "Pilihan A | Pilihan B | Pilihan C | Pilihan D | Pilihan E"
          : selectedSubtest.questionKind === "numeric"
            ? "Masukkan jawaban angka..."
            : "Tulis satu kata atau frasa singkat...",
    };

    setQuestionsByCode((current) => ({
      ...current,
      [selectedCode]: [...current[selectedCode], newQuestion],
    }));
    setNotice(`Soal ${nextNumber} ditambahkan ke ${selectedSubtest.draftVersion}.`);
  }

  function saveDraft() {
    setNotice(
      `Perubahan ${selectedSubtest.draftVersion} tersimpan pada simulasi. Versi published belum berubah.`,
    );
  }

  function submitForReview() {
    const hasEmptyPrompt = selectedQuestions.some((question) => !question.prompt.trim());

    if (!selectedSubtest.title.trim() || selectedSubtest.durationMinutes < 1 || hasEmptyPrompt) {
      setNotice("Lengkapi judul, durasi, dan seluruh prompt sebelum mengajukan review.");
      return;
    }

    setSubtestsByCode((current) => ({
      ...current,
      [selectedCode]: { ...current[selectedCode], status: "in_review" },
    }));
    setNotice(
      `${selectedSubtest.draftVersion} diajukan untuk review. Publikasi tetap memerlukan permission dan persetujuan.`,
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-subtle)]">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Subtes
          </p>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">9</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Urutan tetap IST</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-subtle)]">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Soal pada workspace
          </p>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{totalQuestions}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Data dummy untuk alur editor</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--accent-soft)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Aturan versi
          </p>
          <p className="mt-2 text-lg font-bold text-[var(--text-primary)]">
            Published tidak diedit
          </p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            Semua perubahan dibuat sebagai draft baru dan tercatat di audit log.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <PrototypeBadge tone="info">Simulasi in-memory</PrototypeBadge>
              <PrototypeBadge
                tone={
                  selectedSubtest.status === "published"
                    ? "success"
                    : selectedSubtest.status === "draft"
                      ? "warning"
                      : "info"
                }
              >
                {statusLabel(selectedSubtest.status)}
              </PrototypeBadge>
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
              Editor versi subtes
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Versi aktif {selectedSubtest.publishedVersion}. Draft tidak memengaruhi peserta sampai
              melewati review dan dipublikasikan.
            </p>
          </div>

          <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
            Pilih subtes
            <select
              value={selectedCode}
              onChange={(event) => {
                if (isSubtestCode(event.target.value)) {
                  setSelectedCode(event.target.value);
                  setNotice(null);
                }
              }}
              className="h-12 min-w-56 rounded-xl border border-[var(--border-default)] bg-white px-4 text-sm outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            >
              {subtests.map((subtest) => (
                <option key={subtest.code} value={subtest.code}>
                  {subtest.code} · {subtest.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_180px]">
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
            Judul subtes
            <input
              value={selectedSubtest.title}
              disabled={!canEdit}
              onChange={(event) => updateSubtest({ title: event.target.value })}
              className="h-12 rounded-xl border border-[var(--border-default)] bg-white px-4 text-sm outline-none disabled:bg-[var(--surface-subtle)] disabled:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
            Durasi (menit)
            <input
              type="number"
              min="1"
              value={selectedSubtest.durationMinutes}
              disabled={!canEdit}
              onChange={(event) =>
                updateSubtest({ durationMinutes: Number(event.target.value) || 0 })
              }
              className="h-12 rounded-xl border border-[var(--border-default)] bg-white px-4 text-sm outline-none disabled:bg-[var(--surface-subtle)] disabled:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {selectedSubtest.status === "published" ? (
            <button
              type="button"
              onClick={createDraft}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
            >
              Buat draft pembaruan
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canEdit}
            onClick={addQuestion}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--accent-primary)] px-5 text-sm font-semibold text-[var(--accent-primary)] disabled:cursor-not-allowed disabled:border-[var(--border-default)] disabled:text-[var(--text-muted)]"
          >
            Tambah soal
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={saveDraft}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)] disabled:cursor-not-allowed disabled:text-[var(--text-muted)]"
          >
            Simpan draft
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={submitForReview}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--text-primary)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Ajukan review
          </button>
        </div>

        {notice ? (
          <p
            role="status"
            className="mt-5 rounded-xl border border-[var(--border-default)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]"
          >
            {notice}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Item {selectedCode}
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
              {selectedQuestions.length} soal dalam versi kerja
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
            Kunci jawaban, rubrik GE, dan norma tidak dikelola dari halaman ini.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {selectedQuestions.map((question) => (
            <article
              key={question.id}
              className="grid gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-5 lg:grid-cols-[72px_1fr_180px]"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Nomor
                </p>
                <p className="mt-2 font-mono text-lg font-bold text-[var(--text-primary)]">
                  {String(question.localNumber).padStart(2, "0")}
                </p>
              </div>
              <div className="space-y-3">
                <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  Prompt soal
                  <textarea
                    rows={2}
                    value={question.prompt}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateQuestion(question.id, { prompt: event.target.value })
                    }
                    className="resize-y rounded-xl border border-[var(--border-default)] bg-white px-4 py-3 text-sm leading-6 outline-none disabled:bg-[var(--surface-panel)] disabled:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  Opsi atau konfigurasi respons
                  <input
                    value={question.responseConfig}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateQuestion(question.id, { responseConfig: event.target.value })
                    }
                    className="h-11 rounded-xl border border-[var(--border-default)] bg-white px-4 text-sm outline-none disabled:bg-[var(--surface-panel)] disabled:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                  />
                </label>
              </div>
              <label className="grid content-start gap-2 text-sm font-semibold text-[var(--text-primary)]">
                Tipe respons
                <select
                  value={question.kind}
                  disabled={!canEdit}
                  onChange={(event) => {
                    if (isQuestionKind(event.target.value)) {
                      updateQuestion(question.id, { kind: event.target.value });
                    }
                  }}
                  className="h-11 rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none disabled:bg-[var(--surface-panel)] disabled:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                >
                  <option value="choice">Pilihan</option>
                  <option value="short-text">Teks singkat</option>
                  <option value="numeric">Angka</option>
                </select>
              </label>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
