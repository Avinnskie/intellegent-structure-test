"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CourseRail } from "@/components/participant/course-rail";
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
import { useAutosave, type AutosaveStatus } from "@/components/participant/use-autosave";
import type { SubtestCode } from "@/lib/ist-subtests";
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

const AUTOSAVE_LABELS: Record<AutosaveStatus, string | null> = {
  idle: null,
  menyimpan: "Menyimpan…",
  tersimpan: "Tersimpan",
  gagal: "Gagal menyimpan — periksa koneksi",
};

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
  const [draftItemId, setDraftItemId] = useState(currentItem.itemVersionId);
  if (draftItemId !== currentItem.itemVersionId) {
    setDraftItemId(currentItem.itemVersionId);
    setIsAdvancing(false);
  }

  const {
    status: autosaveStatus,
    queueSave,
    flush,
  } = useAutosave(
    `/api/sessions/${encodeURIComponent(token)}/responses/${currentItem.itemVersionId}`,
  );

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
        void fetch(`/api/sessions/${encodeURIComponent(token)}/heartbeat`, { method: "POST" })
          .catch(() => null)
          .finally(() => router.refresh());
      }
    }, 1000);

    return () => window.clearInterval(tick);
  }, [serverNowMs, expiresAtMs, durationSeconds, router, token]);
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

  const goToReview = useCallback(() => {
    router.push(`/test/${token}/review/${subtestCode}`);
  }, [router, token, subtestCode]);

  const advance = useCallback(() => {
    if (activeLocal >= totalItems) {
      goToReview();
      return;
    }
    goTo(activeLocal + 1);
  }, [activeLocal, totalItems, goTo, goToReview]);

  function handleValueChange(value: string) {
    if (isAdvancing) {
      return;
    }
    setDrafts((previous) => writeDraft(previous, currentItem.itemVersionId, value));
    if (canSubmitValue(currentItem, value)) {
      queueSave(value);
    }
  }

  async function handleSubmit() {
    if (isAdvancing || !canSubmitValue(currentItem, draft)) {
      return;
    }
    setIsAdvancing(true);
    const saved = await flush(draft);
    if (saved) {
      setLocalStatuses((previous) => ({ ...previous, [activeLocal]: "answered" }));
      advance();
      return;
    }
    setIsAdvancing(false);
    router.refresh();
  }

  async function handleSkip() {
    if (isAdvancing) {
      return;
    }
    setIsAdvancing(true);
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(token)}/responses/${currentItem.itemVersionId}/skip`,
        { method: "POST" },
      );
      if (response.ok) {
        setLocalStatuses((previous) =>
          isAnsweredStatus(previous[activeLocal] ?? "unanswered")
            ? previous
            : { ...previous, [activeLocal]: "skipped" },
        );
        advance();
        return;
      }
    } catch {}
    setIsAdvancing(false);
    router.refresh();
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
          autosaveLabel={isAdvancing ? "Menyimpan…" : AUTOSAVE_LABELS[autosaveStatus]}
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
          onComplete={goToReview}
        />
      </div>
    </section>
  );
}
