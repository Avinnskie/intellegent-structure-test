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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export function TutorialManager({ subtests }: { subtests: readonly TutorialSubtestDto[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [selectedCode, setSelectedCode] = useState(subtests[0]?.code ?? "SE");
  const [isBusy, setIsBusy] = useState(false);
  const [pending, setPending] = useState<{
    action: "publish" | "archive";
    version: TutorialVersionDto;
  } | null>(null);

  const [editor, setEditor] = useState<{
    id: string | null;
    textContent: string;
    videoReference: string;
    isUploading: boolean;
  } | null>(null);

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
                ? "border-primary bg-accent text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
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

      <article className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
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
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
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

              <div className="grid gap-2 text-sm font-semibold text-foreground">
                Media tutorial{" "}
                <span className="font-normal text-muted-foreground">
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
                    className="w-full min-w-0 max-w-full rounded-lg border border-border p-3 text-sm font-normal text-muted-foreground hover:bg-muted"
                  />
                  {editor.isUploading ? (
                    <span className="text-xs font-normal text-muted-foreground">Mengunggah…</span>
                  ) : null}
                  {editor.videoReference ? (
                    <>
                      <span className="max-w-56 truncate rounded-lg bg-muted px-2 py-1 font-mono text-xs font-normal">
                        {editor.videoReference}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditor({ ...editor, videoReference: "" })}
                        className="text-xs font-semibold text-destructive hover:underline"
                      >
                        <X />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 border-t border-border pt-4">
                <Button
                  disabled={isBusy || editor.isUploading || editor.textContent.trim() === ""}
                  onClick={handleSaveDraft}
                  className="h-12 bg-primary hover:bg-primary/90"
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
          <Table className="min-w-full text-left">
            <TableHeader className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <TableRow>
                <TableHead className="pb-3">Versi</TableHead>
                <TableHead className="pb-3">Status</TableHead>
                <TableHead className="pb-3">Konten</TableHead>
                <TableHead className="pb-3">Efektif</TableHead>
                <TableHead className="pb-3">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-sm text-foreground align-top">
              {selected.versions.map((version) => (
                <TableRow key={version.id} className="border-t border-border">
                  <TableCell className="py-4 font-mono">v{version.version}</TableCell>
                  <TableCell className="py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] ${
                        version.status === "published"
                          ? "bg-accent text-primary"
                          : version.status === "draft"
                            ? "bg-accent text-foreground"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABELS[version.status] ?? version.status}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-md py-4">
                    <span className="line-clamp-2 whitespace-pre-line text-muted-foreground">
                      {version.textContent}
                    </span>
                    {version.videoReference ? (
                      <span className="mt-1 block font-mono text-xs text-muted-foreground">
                        video: {version.videoReference}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="py-4">{version.effectiveDate ?? "—"}</TableCell>
                  <TableCell className="py-4">
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
                            className="font-semibold text-primary hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setPending({ action: "publish", version })}
                            className="font-semibold text-primary hover:underline"
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
                          className="font-semibold text-destructive hover:underline"
                        >
                          Arsipkan
                        </button>
                      ) : null}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </article>
    </section>
  );
}
