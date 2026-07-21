"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { TutorialSubtestDto, TutorialVersionDto } from "@/lib/server/content.ts";
import { X } from "lucide-react";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Coba lagi.";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  published: "Terbit",
  archived: "Arsip",
  in_review: "Direview",
  approved: "Disetujui",
  rejected: "Ditolak",
};

/**
 * Tutorial CRUD on real data. The rules the UI enforces visually (the server enforces them for
 * real): published versions are read-only — editing means drafting a new version; publishing
 * archives the previous published one; sessions already created keep their pinned version.
 */
export function TutorialManager({ subtests }: { subtests: readonly TutorialSubtestDto[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [selectedCode, setSelectedCode] = useState(subtests[0]?.code ?? "SE");
  const [isBusy, setIsBusy] = useState(false);
  const [pending, setPending] = useState<{
    action: "publish" | "archive";
    version: TutorialVersionDto;
  } | null>(null);

  // Draft editor state: null = closed; id null = creating a NEW draft.
  const [editor, setEditor] = useState<{
    id: string | null;
    textContent: string;
    videoReference: string;
    isUploading: boolean;
  } | null>(null);

  /** Accepts video OR image; the media kind (and its size limit) follows the file's MIME type. */
  async function handleUploadMedia(file: File) {
    const isImage = file.type.startsWith("image/");
    setEditor((current) => (current ? { ...current, isUploading: true } : current));
    try {
      const form = new FormData();
      form.set("kind", isImage ? "tutorial-image" : "tutorial-video");
      form.set("file", file);
      const response = await fetch("/api/hr/media", { method: "POST", body: form });
      if (response.ok) {
        const dto = (await response.json()) as { path: string };
        setEditor((current) =>
          current ? { ...current, videoReference: dto.path, isUploading: false } : current,
        );
        push(
          "success",
          `${isImage ? "Gambar" : "Video"} terunggah. Simpan draft untuk melampirkannya.`,
        );
        return;
      }
      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      push("error", envelope.error?.message ?? NETWORK_ERROR_MESSAGE);
    } catch {
      push("error", NETWORK_ERROR_MESSAGE);
    }
    setEditor((current) => (current ? { ...current, isUploading: false } : current));
  }

  const selected = subtests.find((subtest) => subtest.code === selectedCode) ?? subtests[0];

  async function call(path: string, method: string, body?: unknown): Promise<boolean> {
    setIsBusy(true);
    try {
      const response = await fetch(path, {
        method,
        ...(body !== undefined
          ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : {}),
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

  async function handleSaveDraft() {
    if (!editor || !selected) {
      return;
    }
    const payload = {
      textContent: editor.textContent.trim(),
      ...(editor.videoReference.trim() ? { videoReference: editor.videoReference.trim() } : {}),
    };
    const ok = editor.id
      ? await call(`/api/hr/tutorials/${editor.id}`, "PUT", payload)
      : await call("/api/hr/tutorials", "POST", { ...payload, subtestCode: selected.code });
    if (ok) {
      setEditor(null);
      push("success", editor.id ? "Draft diperbarui." : "Draft baru dibuat.");
    }
  }

  async function handleConfirmPending() {
    if (!pending) {
      return;
    }
    const { action, version } = pending;
    setPending(null);
    if (await call(`/api/hr/tutorials/${version.id}/${action}`, "POST")) {
      push(
        "success",
        action === "publish"
          ? `v${version.version} diterbitkan.`
          : `v${version.version} diarsipkan.`,
      );
    }
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
              setEditor(null);
            }}
            aria-pressed={subtest.code === selected.code}
            className={`inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold ${
              subtest.code === selected.code
                ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                : "border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
            }`}
          >
            {subtest.code}
          </button>
        ))}
      </div>

      <ConfirmDialog
        open={pending?.action === "publish"}
        title={`Terbitkan v${pending?.version.version}?`}
        description="Versi terbit sebelumnya akan diarsipkan. Sesi yang sudah dibuat tetap memakai versi yang di-pin — hanya sesi baru yang memakai versi ini."
        confirmLabel="Terbitkan"
        isBusy={isBusy}
        onConfirm={() => void handleConfirmPending()}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.action === "archive"}
        title={`Arsipkan v${pending?.version.version}?`}
        description={
          pending?.version.status === "published"
            ? "Versi ini sedang TERBIT. Pembuatan sesi baru akan GAGAL sampai versi lain diterbitkan untuk subtes ini."
            : "Draft yang diarsipkan tidak dapat diterbitkan lagi."
        }
        confirmLabel="Arsipkan"
        tone="danger"
        isBusy={isBusy}
        onConfirm={() => void handleConfirmPending()}
        onCancel={() => setPending(null)}
      />

      <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
              Tutorial {selected.code} — {selected.title}
            </h2>
          </div>
          <button
            type="button"
            disabled={isBusy || editor !== null}
            onClick={() => {
              const published = selected.versions.find((version) => version.status === "published");
              setEditor({
                id: null,
                textContent: published?.textContent ?? "",
                videoReference: published?.videoReference ?? "",
                isUploading: false,
              });
            }}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Buat draft baru
          </button>
        </div>

        <Modal
          open={editor !== null}
          title={editor?.id ? "Edit draft tutorial" : `Draft tutorial baru — ${selected.code}`}
          description="Draft dapat diedit bebas; setelah diterbitkan, versinya permanen dan di-pin oleh sesi."
          size="lg"
          onClose={() => setEditor(null)}
        >
          {editor ? (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="tutorial-text">Teks tutorial</Label>
                <Textarea
                  id="tutorial-text"
                  value={editor.textContent}
                  onChange={(event) => setEditor({ ...editor, textContent: event.target.value })}
                  rows={8}
                  maxLength={10_000}
                />
              </div>

              <div className="grid gap-2 text-sm font-semibold text-[var(--text-primary)]">
                Media tutorial{" "}
                <span className="font-normal text-[var(--text-muted)]">
                  (opsional — video mp4/webm maks. 100 MB, atau gambar png/jpg/webp maks. 5 MB)
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="file"
                    accept="video/mp4,video/webm,image/png,image/jpeg,image/webp"
                    disabled={editor.isUploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleUploadMedia(file);
                      }
                      event.target.value = "";
                    }}
                    className="text-sm font-normal p-3 rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
                  />
                  {editor.isUploading ? (
                    <span className="text-xs font-normal text-[var(--text-muted)]">
                      Mengunggah…
                    </span>
                  ) : null}
                  {editor.videoReference ? (
                    <>
                      <span className="max-w-56 truncate rounded-lg bg-[var(--surface-subtle)] px-2 py-1 font-mono text-xs font-normal">
                        {editor.videoReference}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditor({ ...editor, videoReference: "" })}
                        className="text-xs font-semibold text-[var(--status-error)] hover:underline"
                      >
                        <X />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 border-t border-[var(--border-subtle)] pt-4">
                <Button
                  disabled={isBusy || editor.isUploading || editor.textContent.trim() === ""}
                  onClick={handleSaveDraft}
                  className="h-12 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)]"
                >
                  {editor.id ? "Simpan perubahan draft" : "Simpan sebagai draft"}
                </Button>
                <Button className="h-12" variant="outline" onClick={() => setEditor(null)}>
                  Batal
                </Button>
              </div>
            </div>
          ) : null}
        </Modal>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <tr>
                <th className="pb-3">Versi</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Konten</th>
                <th className="pb-3">Efektif</th>
                <th className="pb-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="text-sm text-[var(--text-primary)] align-top">
              {selected.versions.map((version) => (
                <tr key={version.id} className="border-t border-[var(--border-subtle)]">
                  <td className="py-4 font-mono">v{version.version}</td>
                  <td className="py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] ${
                        version.status === "published"
                          ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                          : version.status === "draft"
                            ? "bg-[var(--accent-warm-soft)] text-[var(--text-primary)]"
                            : "bg-[var(--surface-subtle)] text-[var(--text-muted)]"
                      }`}
                    >
                      {STATUS_LABELS[version.status] ?? version.status}
                    </span>
                  </td>
                  <td className="max-w-md py-4">
                    <span className="line-clamp-2 whitespace-pre-line text-[var(--text-secondary)]">
                      {version.textContent}
                    </span>
                    {version.videoReference ? (
                      <span className="mt-1 block font-mono text-xs text-[var(--text-muted)]">
                        video: {version.videoReference}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-4">{version.effectiveDate ?? "—"}</td>
                  <td className="py-4">
                    <span className="flex flex-wrap gap-3">
                      {version.status === "draft" ? (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              setEditor({
                                id: version.id,
                                textContent: version.textContent,
                                videoReference: version.videoReference ?? "",
                                isUploading: false,
                              })
                            }
                            className="font-semibold text-[var(--accent-primary)] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setPending({ action: "publish", version })}
                            className="font-semibold text-[var(--accent-primary)] hover:underline"
                          >
                            Terbitkan
                          </button>
                        </>
                      ) : null}
                      {version.status !== "archived" ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setPending({ action: "archive", version })}
                          className="font-semibold text-[var(--status-error)] hover:underline"
                        >
                          Arsipkan
                        </button>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
