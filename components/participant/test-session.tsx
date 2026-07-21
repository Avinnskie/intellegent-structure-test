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
  /** Signed URL of the current item's image, minted server-side; null = no image. */
  readonly currentMediaUrl?: string | null;
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
  currentMediaUrl = null,
  expiresAt,
  serverNow,
}: TestSessionProps) {
  const router = useRouter();

  const currentItem = useMemo(
    () => items.find((item) => item.localNumber === currentLocal) ?? items[0],
    [items, currentLocal],
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

  const [draft, setDraft] = useState("");
  // Locks every input the moment an answer/skip is in flight, so the gap between the click and the
  // next page rendering cannot swallow (or double-send) a second interaction.
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [draftItemId, setDraftItemId] = useState(currentItem.itemVersionId);
  if (draftItemId !== currentItem.itemVersionId) {
    setDraftItemId(currentItem.itemVersionId);
    setDraft("");
    // A new item has rendered — the navigation that locked the panel has completed.
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

  const routeFor = useCallback(
    (localNumber: number) => `/test/${token}/question/${subtestCode}/${localNumber}`,
    [token, subtestCode],
  );

  const goTo = useCallback(
    (localNumber: number) => {
      router.push(routeFor(localNumber));
    },
    [router, routeFor],
  );

  const goToReview = useCallback(() => {
    router.push(`/test/${token}/review/${subtestCode}`);
  }, [router, token, subtestCode]);

  const advance = useCallback(() => {
    if (currentLocal >= totalItems) {
      goToReview();
      return;
    }
    goTo(currentLocal + 1);
  }, [currentLocal, totalItems, goTo, goToReview]);

  function handleValueChange(value: string) {
    if (isAdvancing) {
      // A click that lands in the gap between "Jawab & lanjut" and the next page must not change
      // the answer that is being submitted.
      return;
    }
    setDraft(value);
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
      setLocalStatuses((previous) => ({ ...previous, [currentLocal]: "answered" }));
      advance();
      // The lock is released by the reset-on-prop-change block when the next item renders.
      return;
    }
    // Save failed: unlock so the participant can retry with their answer still on screen.
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
          isAnsweredStatus(previous[currentLocal] ?? "unanswered")
            ? previous
            : { ...previous, [currentLocal]: "skipped" },
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

  const currentStatus = localStatuses[currentLocal] ?? "unanswered";
  const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const seconds = String(remainingSeconds % 60).padStart(2, "0");

  return (
    <section className="h-full w-full lg:pb-0 grid gap-6 xl:grid-cols-[280px_1fr]">
      <CourseRail currentCode={subtestCode} />
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        {/* <SessionTimer minutes={minutes} seconds={seconds} className="sticky top-4 z-30 xl:hidden" /> */}
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
          mediaUrl={currentMediaUrl}
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
            currentItem: currentLocal,
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
