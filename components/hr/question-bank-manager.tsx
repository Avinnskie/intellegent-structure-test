"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { TagsInput } from "@/components/ui/tags-input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { QuestionBankItemDto, QuestionBankSubtestDto } from "@/lib/server/content.ts";
import { X } from "lucide-react";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Coba lagi.";

type Draft = {
  mode: "create" | "edit";
  itemVersionId: string;
  subtestCode: string;
  itemType: string;
  prompt: string;
  placeholder: string;
  options: { optionCode: string; label: string }[];
  /** Kunci jawaban — dimuat terpisah saat editor dibuka; null selama masih dimuat. */
  correctOptionCode: string | null;
  acceptedValues: string;
  geScore2: string[];
  geScore1: string[];
  geScore0: string[];
  keyLoaded: boolean;
  /** Path gambar saat ini; undefined = tidak diubah, null = dilepas. */
  mediaReference: string | null | undefined;
  isUploading: boolean;
};

/**
 * Question bank editor on real data. Edits are IN PLACE and reach running sessions (deliberate —
 * the typo-fix tool). Option CODES stay read-only; what HR now controls per item is the ANSWER
 * KEY: the correct option (choice) or accepted values (numeric), fetched on demand — the bulk
 * list never carries keys. Images upload from the local device into the private media bucket.
 */
export function QuestionBankManager({ subtests }: { subtests: readonly QuestionBankSubtestDto[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [selectedCode, setSelectedCode] = useState(subtests[0]?.code ?? "SE");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [pending, setPending] = useState<
    { kind: "save" } | { kind: "create" } | { kind: "deactivate"; item: QuestionBankItemDto } | null
  >(null);

  const selected = subtests.find((subtest) => subtest.code === selectedCode) ?? subtests[0];

  async function call(path: string, method: string, body: unknown): Promise<boolean> {
    setIsBusy(true);
    try {
      const response = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        router.refresh();
        return true;
      }
      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      push("error", envelope.error?.message ?? NETWORK_ERROR_MESSAGE);
      return false;
    } catch {
      push("error", NETWORK_ERROR_MESSAGE);
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  async function openEditor(item: QuestionBankItemDto) {
    setDraft({
      mode: "edit",
      itemVersionId: item.itemVersionId,
      subtestCode: selected.code,
      itemType: item.itemType,
      prompt: item.prompt,
      placeholder: item.placeholder ?? "",
      options: item.options.map((option) => ({ ...option })),
      correctOptionCode: null,
      acceptedValues: "",
      geScore2: [],
      geScore1: [],
      geScore0: [],
      keyLoaded: false,
      mediaReference: undefined,
      isUploading: false,
    });

    try {
      const response = await fetch(`/api/hr/question-bank/items/${item.itemVersionId}/answer-key`);
      if (response.ok) {
        const key = (await response.json()) as {
          correctOptionCodes: string[] | null;
          acceptedValues: string[] | null;
          geKeywords: {
            score2: string[];
            score1: string[];
            score0: string[];
          } | null;
        };
        setDraft((current) =>
          current && current.itemVersionId === item.itemVersionId
            ? {
                ...current,
                correctOptionCode: key.correctOptionCodes?.[0] ?? null,
                acceptedValues: key.acceptedValues?.join(", ") ?? "",
                geScore2: [...(key.geKeywords?.score2 ?? [])],
                geScore1: [...(key.geKeywords?.score1 ?? [])],
                geScore0: [...(key.geKeywords?.score0 ?? [])],
                keyLoaded: true,
              }
            : current,
        );
        return;
      }
    } catch {
      // Falls through to the toast below.
    }
    push("error", "Kunci jawaban gagal dimuat — simpan tanpa mengubah kunci, atau buka ulang.");
  }

  function openCreate() {
    setDraft({
      mode: "create",
      itemVersionId: "",
      subtestCode: selected.code,
      itemType: "choice",
      prompt: "",
      placeholder: "",
      options: [
        { optionCode: "a", label: "" },
        { optionCode: "b", label: "" },
        { optionCode: "c", label: "" },
        { optionCode: "d", label: "" },
        { optionCode: "e", label: "" },
      ],
      correctOptionCode: "a",
      acceptedValues: "",
      geScore2: [],
      geScore1: [],
      geScore0: [],
      keyLoaded: true,
      mediaReference: undefined,
      isUploading: false,
    });
  }

  async function handleUploadImage(file: File) {
    if (!draft) {
      return;
    }
    setDraft({ ...draft, isUploading: true });
    try {
      const form = new FormData();
      form.set("kind", "item-image");
      form.set("file", file);
      const response = await fetch("/api/hr/media", { method: "POST", body: form });
      if (response.ok) {
        const dto = (await response.json()) as { path: string };
        setDraft((current) =>
          current ? { ...current, mediaReference: dto.path, isUploading: false } : current,
        );
        push("success", "Gambar terunggah. Simpan perubahan untuk melampirkannya.");
        return;
      }
      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      push("error", envelope.error?.message ?? NETWORK_ERROR_MESSAGE);
    } catch {
      push("error", NETWORK_ERROR_MESSAGE);
    }
    setDraft((current) => (current ? { ...current, isUploading: false } : current));
  }

  async function handleSaveConfirmed() {
    setPending(null);
    if (!draft) {
      return;
    }
    const acceptedValues = draft.acceptedValues
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value !== "");

    const geScore2 = draft.geScore2;
    const geScore1 = draft.geScore1;
    const geScore0 = draft.geScore0;
    const geHasAny = geScore2.length > 0 || geScore1.length > 0 || geScore0.length > 0;

    const body = {
      prompt: draft.prompt.trim(),
      ...(draft.placeholder.trim() ? { placeholder: draft.placeholder.trim() } : {}),
      ...(draft.options.length > 0
        ? { options: draft.options.map((option) => ({ ...option, label: option.label.trim() })) }
        : {}),
      // The key is sent only when it was loaded (so a failed key fetch cannot blank a key).
      ...(draft.keyLoaded && draft.itemType === "choice" && draft.correctOptionCode
        ? { correctOptionCodes: [draft.correctOptionCode] }
        : {}),
      ...(draft.keyLoaded && draft.itemType === "numeric" && acceptedValues.length > 0
        ? { acceptedValues }
        : {}),
      ...(draft.keyLoaded && draft.itemType === "short_text" && geHasAny
        ? { geKeywords: { score2: geScore2, score1: geScore1, score0: geScore0 } }
        : {}),
      ...(draft.mediaReference !== undefined ? { mediaReference: draft.mediaReference } : {}),
      ...(draft.mode === "create"
        ? { subtestCode: draft.subtestCode, itemType: draft.itemType }
        : {}),
    };
    const ok = await call(
      draft.mode === "create"
        ? "/api/hr/question-bank/items"
        : `/api/hr/question-bank/items/${draft.itemVersionId}`,
      draft.mode === "create" ? "POST" : "PUT",
      body,
    );
    if (ok) {
      setDraft(null);
      push("success", draft.mode === "create" ? "Soal baru ditambahkan." : "Soal diperbarui.");
    }
  }

  async function setStatus(item: QuestionBankItemDto, next: "active" | "inactive") {
    if (
      await call(`/api/hr/question-bank/items/${item.itemVersionId}/status`, "POST", {
        status: next,
      })
    ) {
      push("success", `Soal #${item.itemNumber} → ${next === "active" ? "aktif" : "nonaktif"}.`);
    }
  }

  function handleToggleStatus(item: QuestionBankItemDto) {
    if (item.status === "active") {
      setPending({ kind: "deactivate", item });
      return;
    }
    void setStatus(item, "active");
  }

  if (!selected) {
    return null;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {subtests.map((subtest) => (
          <button
            key={subtest.code}
            type="button"
            onClick={() => {
              setSelectedCode(subtest.code);
              setDraft(null);
            }}
            aria-pressed={subtest.code === selected.code}
            className={`inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold ${
              subtest.code === selected.code
                ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                : "border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
            }`}
          >
            {subtest.code}
            <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
              {subtest.items.length}
            </span>
          </button>
        ))}
      </div>

      <ConfirmDialog
        open={pending?.kind === "save"}
        title={draft?.mode === "create" ? "Tambahkan soal baru?" : "Simpan perubahan soal?"}
        description={
          draft?.mode === "create"
            ? "Soal baru masuk ke form published saat ini dan memiliki kunci skoring langsung."
            : "Perubahan (termasuk kunci jawaban) berlaku langsung dan terlihat oleh sesi yang sedang berjalan — ini alat perbaikan, bukan revisi struktur."
        }
        confirmLabel={draft?.mode === "create" ? "Tambahkan" : "Simpan"}
        isBusy={isBusy}
        onConfirm={() => void handleSaveConfirmed()}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === "deactivate"}
        title={`Nonaktifkan soal #${pending?.kind === "deactivate" ? pending.item.itemNumber : ""}?`}
        description="Soal tetap tersaji pada sesi berjalan (dek di-pin); tanda nonaktif dipakai untuk review dan versi form berikutnya."
        confirmLabel="Nonaktifkan"
        tone="danger"
        isBusy={isBusy}
        onConfirm={() => {
          const target = pending?.kind === "deactivate" ? pending.item : null;
          setPending(null);
          if (target) {
            void setStatus(target, "inactive");
          }
        }}
        onCancel={() => setPending(null)}
      />

      <Modal
        open={draft !== null}
        title={draft?.mode === "create" ? "Tambah soal baru" : "Edit soal"}
        description={
          draft?.mode === "create"
            ? "Buat soal untuk subtes terpilih lengkap dengan kunci jawaban."
            : "Kode opsi terkunci (terikat kunci skoring & jawaban terekam). Kunci jawaban di bawah menentukan penilaian otomatis."
        }
        size="lg"
        onClose={() => setDraft(null)}
      >
        {draft ? (
          <div className="space-y-4">
            {draft.mode === "create" ? (
              <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
                Tipe soal
                <select
                  value={draft.itemType}
                  onChange={(event) => {
                    const itemType = event.target.value;
                    setDraft({
                      ...draft,
                      itemType,
                      options:
                        itemType === "choice" && draft.options.length > 0
                          ? draft.options
                          : itemType === "choice"
                            ? [
                                { optionCode: "a", label: "" },
                                { optionCode: "b", label: "" },
                              ]
                            : [],
                      correctOptionCode:
                        itemType === "choice" ? (draft.correctOptionCode ?? "a") : null,
                      acceptedValues: itemType === "numeric" ? draft.acceptedValues : "",
                    });
                  }}
                  className="h-11 w-full min-w-0 max-w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] px-3 text-sm font-normal text-[var(--text-primary)]"
                >
                  <option value="choice">Pilihan ganda</option>
                  <option value="numeric">Angka</option>
                  <option value="short_text">Jawaban singkat / GE</option>
                </select>
              </label>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="item-prompt">Pertanyaan</Label>
              <Textarea
                id="item-prompt"
                value={draft.prompt}
                onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
                rows={3}
                maxLength={2000}
              />
            </div>

            {draft.itemType === "choice" ? (
              <div className="grid gap-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Opsi jawaban —{" "}
                  <span className="font-normal text-[var(--text-muted)]">
                    pilih tombol radio untuk menandai jawaban BENAR
                  </span>
                </p>
                {!draft.keyLoaded ? (
                  <p className="text-xs text-[var(--text-muted)]">Memuat kunci jawaban…</p>
                ) : null}
                {draft.options.map((option, index) => (
                  <div key={option.optionCode} className="flex items-center gap-3 text-sm">
                    <input
                      type="radio"
                      name="correct-option"
                      checked={draft.correctOptionCode === option.optionCode}
                      disabled={!draft.keyLoaded}
                      onChange={() => setDraft({ ...draft, correctOptionCode: option.optionCode })}
                      aria-label={`Jawaban benar: opsi ${option.optionCode}`}
                      className="size-4 accent-[var(--accent-primary)]"
                    />
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] font-mono font-bold uppercase">
                      {option.optionCode}
                    </span>
                    <Input
                      value={option.label}
                      maxLength={500}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          options: draft.options.map((current, currentIndex) =>
                            currentIndex === index
                              ? { ...current, label: event.target.value }
                              : current,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {draft.itemType === "numeric" ? (
              <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
                Kunci jawaban angka{" "}
                <span className="font-normal text-[var(--text-muted)]">
                  (varian diterima, pisahkan dengan koma — mis. 12, 12.0)
                </span>
                <Input
                  value={draft.acceptedValues}
                  disabled={!draft.keyLoaded}
                  onChange={(event) => setDraft({ ...draft, acceptedValues: event.target.value })}
                  className="font-mono"
                />
              </label>
            ) : null}

            {draft.itemType === "short_text" ? (
              <>
                <label className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  Placeholder input{" "}
                  <span className="font-normal text-[var(--text-muted)]">(opsional)</span>
                  <Input
                    value={draft.placeholder}
                    maxLength={200}
                    onChange={(event) => setDraft({ ...draft, placeholder: event.target.value })}
                  />
                </label>

                <div className="grid gap-3 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      Kunci referensi jawaban (GE)
                    </p>
                    {!draft.keyLoaded ? (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">Memuat kunci jawaban…</p>
                    ) : null}
                  </div>

                  <div className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]">
                    <span>
                      Skor 2{" "}
                      <span className="font-normal text-[var(--text-muted)]">
                        — konsep umum yang paling tepat
                      </span>
                    </span>
                    <TagsInput
                      value={draft.geScore2}
                      disabled={!draft.keyLoaded}
                      placeholder="mis. bunga, kembang, perdu"
                      onChange={(next) => setDraft({ ...draft, geScore2: next })}
                    />
                  </div>

                  <div className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]">
                    <span>
                      Skor 1{" "}
                      <span className="font-normal text-[var(--text-muted)]">
                        — konsep terkait tetapi kurang tepat
                      </span>
                    </span>
                    <TagsInput
                      value={draft.geScore1}
                      disabled={!draft.keyLoaded}
                      placeholder="mis. tumbuh-tumbuhan, tangkai, harum"
                      onChange={(next) => setDraft({ ...draft, geScore1: next })}
                    />
                  </div>

                  <div className="grid gap-1 text-xs font-semibold text-[var(--text-primary)]">
                    <span>
                      Skor 0{" "}
                      <span className="font-normal text-[var(--text-muted)]">
                        — jawaban yang jelas salah (opsional; jawaban di luar semua daftar juga 0)
                      </span>
                    </span>
                    <TagsInput
                      value={draft.geScore0}
                      disabled={!draft.keyLoaded}
                      placeholder="mis. pohon"
                      onChange={(next) => setDraft({ ...draft, geScore0: next })}
                    />
                  </div>
                </div>
              </>
            ) : null}

            <div className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
              Gambar soal <span className="font-normal text-[var(--text-muted)]">(opsional)</span>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={draft.isUploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleUploadImage(file);
                    }
                    event.target.value = "";
                  }}
                  className="text-sm font-normal p-3 rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
                />
                {draft.isUploading ? (
                  <span className="text-xs font-normal text-[var(--text-muted)]">Mengunggah…</span>
                ) : null}
                {draft.mediaReference ? (
                  <span className="rounded-lg bg-[var(--surface-subtle)] px-2 py-1 font-mono text-xs font-normal">
                    {draft.mediaReference}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, mediaReference: null })}
                  className="text-xs font-semibold text-[var(--status-error)] hover:underline"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-[var(--border-subtle)] pt-4">
              <Button
                disabled={
                  isBusy ||
                  draft.isUploading ||
                  draft.prompt.trim() === "" ||
                  draft.options.some((option) => option.label.trim() === "") ||
                  (draft.itemType === "choice" && !draft.correctOptionCode) ||
                  (draft.itemType === "numeric" && draft.acceptedValues.trim() === "")
                }
                onClick={() => setPending({ kind: "save" })}
                className={"h-12 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)]"}
              >
                {draft.mode === "create" ? "Tambah soal" : "Simpan perubahan"}
              </Button>
              <Button variant="outline" onClick={() => setDraft(null)} className="h-12">
                Batal
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <article className="overflow-x-auto rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
              {selected.code} — {selected.title}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              {selected.items.length} soal tersedia untuk subtes ini
            </p>
          </div>
          <Button
            type="button"
            disabled={isBusy}
            onClick={openCreate}
            className="h-11 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)]"
          >
            Tambah soal
          </Button>
        </div>
        <table className="mt-6 min-w-full text-left">
          <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <tr>
              <th className="pb-3">No</th>
              <th className="pb-3">Tipe</th>
              <th className="pb-3">Pertanyaan</th>
              <th className="pb-3">Media</th>
              <th className="pb-3">Status</th>
              <th className="pb-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="align-top text-sm text-[var(--text-primary)]">
            {selected.items.map((item) => (
              <tr key={item.itemVersionId} className="border-t border-[var(--border-subtle)]">
                <td className="py-4 font-mono">
                  {item.localNumber}
                  <span className="block text-xs text-[var(--text-muted)]">#{item.itemNumber}</span>
                </td>
                <td className="py-4">{item.itemType}</td>
                <td className="max-w-md py-4 text-[var(--text-secondary)]">
                  <span className="line-clamp-2">{item.prompt}</span>
                </td>
                <td className="py-4">
                  <div className="max-w-[200px] truncate" title={item.mediaReference ?? undefined}>
                    {item.mediaReference ?? "—"}
                  </div>
                </td>
                <td className="py-4">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] ${
                      item.status === "active"
                        ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                        : "bg-[var(--surface-subtle)] text-[var(--text-muted)]"
                    }`}
                  >
                    {item.status === "active" ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td className="py-4">
                  <span className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void openEditor(item)}
                      className="font-semibold text-[var(--accent-primary)] hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleToggleStatus(item)}
                      className="font-semibold text-[var(--text-secondary)] hover:underline"
                    >
                      {item.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
