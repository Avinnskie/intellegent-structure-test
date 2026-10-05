"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CourseRail } from "@/components/participant/course-rail";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  TestQuestionPanel,
  canSubmitValue,
  type QuestionItem,
} from "@/components/participant/test-question-panel";
import {
  TestSessionSidebar,
  isAnsweredStatus,
  type ItemStatusValue,
} from "@/components/participant/test-session-sidebar";
import type { SubtestCode } from "@/lib/ist-subtests";
import {
  clearSubtestSessionResponses,
  readSubtestSessionResponses,
  removeSubtestSessionResponse,
  writeSubtestSessionResponse,
} from "@/lib/participant-answer-session";
import {
  moveActiveItem,
  readDraft,
  resolveActiveItem,
  seedDrafts,
  writeDraft,
  type ActiveItemState,
  type DraftMap,
} from "@/lib/participant-navigation";

const HEARTBEAT_INTERVAL_MS = 30_000;
type SessionSaveStatus = "idle" | "saved" | "failed";

type TestSessionProps = {
  readonly token: string;
  readonly subtestCode: SubtestCode;
  readonly totalItems: number;
  readonly durationSeconds: number;
  readonly items: readonly QuestionItem[];
  readonly statuses: readonly { itemNumber: number; status: ItemStatusValue }[];
  readonly currentLocal: number;
  readonly mediaUrls?: Readonly<Record<string, string>>;
  readonly expiresAt: string;
  readonly serverNow: string;
};

export function TestSession({
  token,
  subtestCode,
  totalItems,
  durationSeconds,
  items,
  statuses,
  currentLocal,
  mediaUrls = {},
  expiresAt,
  serverNow,
}: TestSessionProps) {
  const router = useRouter();

  const [itemState, setItemState] = useState<ActiveItemState>({
    activeLocal: currentLocal,
    seenServerLocal: currentLocal,
  });

  // Prop server hanya mengambil alih bila nilainya berubah, bukan tiap render.
  const synced = resolveActiveItem(itemState, currentLocal);
  if (synced !== itemState) {
    setItemState(synced);
  }
  const activeLocal = synced.activeLocal;

  const currentItem = useMemo(
    () => items.find((item) => item.localNumber === activeLocal) ?? items[0],
    [items, activeLocal],
  );

  const initialStatuses = useMemo(() => {
    const byGlobal = new Map(statuses.map((entry) => [entry.itemNumber, entry.status]));
    const map: Record<number, ItemStatusValue> = {};
    for (const item of items) {
      map[item.localNumber] = byGlobal.get(item.itemNumber) ?? "unanswered";
    }
    return map;
  }, [items, statuses]);

  const [localStatuses, setLocalStatuses] = useState(initialStatuses);
  const [statusesBase, setStatusesBase] = useState(initialStatuses);
  if (statusesBase !== initialStatuses) {
    setStatusesBase(initialStatuses);
    setLocalStatuses(initialStatuses);
  }

  const [drafts, setDrafts] = useState<DraftMap>(() => seedDrafts(items));
  const [draftsBase, setDraftsBase] = useState(items);
  if (draftsBase !== items) {
    // Server mengirim data baru (mis. masuk ulang subtes) — jadikan acuan.
    setDraftsBase(items);
    setDrafts(seedDrafts(items));
  }

  const draft = readDraft(drafts, currentItem.itemVersionId);

  const [isAdvancing, setIsAdvancing] = useState(false);
  const [sessionSaveStatus, setSessionSaveStatus] = useState<SessionSaveStatus>("idle");
  const [isConfirmingReview, setIsConfirmingReview] = useState(false);
  // Perpindahan ke halaman periksa dirender di server, jadi ada jeda yang
  // perlu terlihat. Tanpa ini tombol tampak tidak bereaksi dan peserta
  // menekannya berulang kali.
  const [isLeavingToReview, startLeavingToReview] = useTransition();
  const [draftItemId, setDraftItemId] = useState(currentItem.itemVersionId);
  if (draftItemId !== currentItem.itemVersionId) {
    setDraftItemId(currentItem.itemVersionId);
    setIsAdvancing(false);
  }

  useEffect(() => {
    const stored = readSubtestSessionResponses(window.sessionStorage, token, subtestCode);
    if (stored.length === 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setDrafts((previous) => {
        let next = previous;
        for (const response of stored) {
          next = writeDraft(
            next,
            response.itemVersionId,
            response.status === "answered" ? response.value : "",
          );
        }
        return next;
      });
      setLocalStatuses((previous) => {
        const next = { ...previous };
        for (const response of stored) {
          next[response.localNumber] = response.status;
        }
        return next;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [token, subtestCode]);

  const completeExpiredSubtest = useCallback(async () => {
    const responses = readSubtestSessionResponses(window.sessionStorage, token, subtestCode);
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(token)}/subtests/${subtestCode}/complete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ responses }),
        },
      );
      if (response.ok) {
        clearSubtestSessionResponses(window.sessionStorage, token, subtestCode);
      }
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error;
      }
    } finally {
      router.refresh();
    }
  }, [router, token, subtestCode]);

  const serverNowMs = Date.parse(serverNow);
  const expiresAtMs = Date.parse(expiresAt);
  const initialRemaining = Math.max(
    0,
    Math.min(Math.ceil((expiresAtMs - serverNowMs) / 1000), durationSeconds),
  );
  const [remainingSeconds, setRemainingSeconds] = useState(initialRemaining);

  useEffect(() => {
    const clockOffset = serverNowMs - Date.now();
    let hasExpired = false;

    const tick = window.setInterval(() => {
      const serverMs = Date.now() + clockOffset;
      const remaining = Math.max(
        0,
        Math.min(Math.ceil((expiresAtMs - serverMs) / 1000), durationSeconds),
      );
      setRemainingSeconds(remaining);
      if (remaining <= 0 && !hasExpired) {
        hasExpired = true;
        window.clearInterval(tick);
        void completeExpiredSubtest();
      }
    }, 1000);

    return () => window.clearInterval(tick);
  }, [serverNowMs, expiresAtMs, durationSeconds, completeExpiredSubtest]);
  useEffect(() => {
    const beat = window.setInterval(() => {
      void fetch(`/api/sessions/${encodeURIComponent(token)}/heartbeat`, {
        method: "POST",
      }).catch(() => null);
    }, HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(beat);
  }, [token]);

  const goTo = useCallback((localNumber: number) => {
    setItemState((previous) => moveActiveItem(previous, localNumber));
    window.scrollTo({ top: 0 });
  }, []);

  /**
   * Menuju halaman periksa. Bersifat satu arah.
   *
   * `replace`, bukan `push`: halaman periksa adalah titik tanpa balik, jadi
   * halaman soal tidak boleh tertinggal di riwayat — tombol back peramban akan
   * mengembalikan peserta ke sana lengkap dengan tombol jawab yang seharusnya
   * sudah tidak berlaku.
   */
  const goToReview = useCallback(() => {
    startLeavingToReview(() => {
      router.replace(`/test/${token}/review/${subtestCode}`);
    });
  }, [router, token, subtestCode]);

  const advance = useCallback(() => {
    if (activeLocal >= totalItems) {
      // Nomor terakhir juga melewati konfirmasi: menjawabnya tidak boleh
      // diam-diam membawa peserta ke titik tanpa balik.
      setIsConfirmingReview(true);
      return;
    }
    goTo(activeLocal + 1);
  }, [activeLocal, totalItems, goTo]);

  function handleValueChange(value: string) {
    if (isAdvancing) {
      return;
    }
    setDrafts((previous) => writeDraft(previous, currentItem.itemVersionId, value));
    if (canSubmitValue(currentItem, value)) {
      const saved = writeSubtestSessionResponse(window.sessionStorage, token, subtestCode, {
        itemVersionId: currentItem.itemVersionId,
        localNumber: currentItem.localNumber,
        status: "answered",
        value,
      });
      setSessionSaveStatus(saved ? "saved" : "failed");
      if (saved) {
        setLocalStatuses((previous) => ({ ...previous, [activeLocal]: "answered" }));
      }
      return;
    }
    const removed = removeSubtestSessionResponse(
      window.sessionStorage,
      token,
      subtestCode,
      currentItem.itemVersionId,
    );
    setSessionSaveStatus(removed ? "idle" : "failed");
    if (removed) {
      setLocalStatuses((previous) => ({ ...previous, [activeLocal]: "unanswered" }));
    }
  }

  function handleSubmit() {
    if (isAdvancing || !canSubmitValue(currentItem, draft)) {
      return;
    }
    setIsAdvancing(true);
    const saved = writeSubtestSessionResponse(window.sessionStorage, token, subtestCode, {
      itemVersionId: currentItem.itemVersionId,
      localNumber: currentItem.localNumber,
      status: "answered",
      value: draft,
    });
    if (saved) {
      setSessionSaveStatus("saved");
      setLocalStatuses((previous) => ({ ...previous, [activeLocal]: "answered" }));
      advance();
      return;
    }
    setSessionSaveStatus("failed");
    setIsAdvancing(false);
  }

  function handleSkip() {
    if (isAdvancing) {
      return;
    }
    setIsAdvancing(true);
    const saved = writeSubtestSessionResponse(window.sessionStorage, token, subtestCode, {
      itemVersionId: currentItem.itemVersionId,
      localNumber: currentItem.localNumber,
      status: "skipped",
    });
    if (saved) {
      setSessionSaveStatus("saved");
      setDrafts((previous) => writeDraft(previous, currentItem.itemVersionId, ""));
      setLocalStatuses((previous) => ({ ...previous, [activeLocal]: "skipped" }));
      advance();
      return;
    }
    setSessionSaveStatus("failed");
    setIsAdvancing(false);
  }

  const sidebarItems = useMemo(
    () =>
      items.map((item) => ({
        localNumber: item.localNumber,
        status: localStatuses[item.localNumber] ?? "unanswered",
      })),
    [items, localStatuses],
  );
  const answeredCount = sidebarItems.filter((item) => isAnsweredStatus(item.status)).length;
  const unansweredCount = totalItems - answeredCount;

  const currentStatus = localStatuses[activeLocal] ?? "unanswered";
  const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const seconds = String(remainingSeconds % 60).padStart(2, "0");

  return (
    <section className="h-full w-full lg:pb-0 grid gap-6 xl:grid-cols-[280px_1fr]">
      <ConfirmDialog
        open={isConfirmingReview}
        title={`Selesaikan subtes ${subtestCode}?`}
        description={
          unansweredCount > 0
            ? `Masih ada ${unansweredCount} soal yang belum dijawab, dan soal itu akan dinilai 0. Anda akan dibawa ke halaman pemeriksaan terakhir dan TIDAK dapat kembali ke soal.`
            : `Seluruh soal sudah dijawab. Anda akan dibawa ke halaman pemeriksaan terakhir dan TIDAK dapat kembali ke soal.`
        }
        confirmLabel={isLeavingToReview ? "Menyiapkan…" : "Ya, lanjutkan"}
        isBusy={isLeavingToReview}
        tone="danger"
        onConfirm={goToReview}
        onCancel={() => setIsConfirmingReview(false)}
      />
      <CourseRail currentCode={subtestCode} />
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        {}
        <TestQuestionPanel
          state={{
            subtestCode,
            item: currentItem,
            totalItems,
            answeredCount,
            status: isAnsweredStatus(currentStatus)
              ? "answered"
              : currentStatus === "skipped"
                ? "skipped"
                : "pending",
            value: draft,
          }}
          autosaveLabel={
            sessionSaveStatus === "saved"
              ? "Tersimpan di sesi ini"
              : sessionSaveStatus === "failed"
                ? "Gagal menyimpan di sesi browser"
                : null
          }
          mediaUrl={mediaUrls[currentItem.itemVersionId] ?? null}
          disabled={isAdvancing}
          onValueChange={handleValueChange}
          onSkip={handleSkip}
          onSubmit={handleSubmit}
        />

        <TestSessionSidebar
          state={{
            code: subtestCode,
            minutes,
            seconds,
            currentItem: activeLocal,
            items: sidebarItems,
            unansweredCount,
          }}
          onJump={goTo}
          onComplete={() => setIsConfirmingReview(true)}
        />
      </div>
    </section>
  );
}
