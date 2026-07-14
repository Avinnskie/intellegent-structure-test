"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CourseRail } from "@/components/participant/course-rail";
import { TestQuestionPanel } from "@/components/participant/test-question-panel";
import { SessionTimer, TestSessionSidebar } from "@/components/participant/test-session-sidebar";
import { demoSession } from "@/lib/ist-data";
import {
  getFirstPendingSubtest,
  getDisplayRemainingSeconds,
  getNextSubtestCode,
  getRemainingSeconds,
  getSubtestByCode,
} from "@/lib/ist-logic";
import { getQuestion } from "@/lib/ist-questions";
import {
  finishAttempt,
  getAttemptSnapshot,
  getServerAttemptSnapshot,
  loadCompletedSubtests,
  markSubtestCompleted,
  setAttemptState,
  startAttempt,
  subscribeAttempts,
  type AttemptState,
} from "@/lib/session-store";

type TestSessionProps = {
  readonly subtestCode: string | null;
};

export function TestSession({ subtestCode }: TestSessionProps) {
  const router = useRouter();
  const subtest = getSubtestByCode(subtestCode);
  const nextSubtestCode = getNextSubtestCode(subtest.code);
  const attempt = useSyncExternalStore(
    subscribeAttempts,
    () => getAttemptSnapshot(subtest.code),
    getServerAttemptSnapshot,
  );
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState<string | null>(null);
  const hasCompletedRef = useRef(false);

  const completeSubtest = useCallback(
    (timeoutTriggered: boolean) => {
      if (hasCompletedRef.current) {
        return;
      }

      hasCompletedRef.current = true;
      markSubtestCompleted(subtest.code);
      finishAttempt(subtest.code);

      if (nextSubtestCode) {
        router.push(
          `/test/tutorial?code=${demoSession.accessCode}&subtest=${nextSubtestCode}&prev=${subtest.code}${timeoutTriggered ? "&reason=timeout" : ""}`,
        );
        return;
      }

      router.push("/test/complete");
    },
    [nextSubtestCode, router, subtest.code],
  );

  useEffect(() => {
    const completed = loadCompletedSubtests();
    const expectedSubtest = getFirstPendingSubtest(completed);

    if (expectedSubtest === null) {
      router.replace("/test/complete");
      return;
    }

    if (expectedSubtest !== subtest.code) {
      router.replace(
        `/test/tutorial?code=${demoSession.accessCode}&subtest=${expectedSubtest}&locked=${subtest.code}`,
      );
      return;
    }

    const existing = getAttemptSnapshot(subtest.code);

    if (existing && getRemainingSeconds(existing.expiresAt) <= 0) {
      completeSubtest(true);
      return;
    }

    startAttempt(subtest.code, subtest.durationMinutes);
  }, [completeSubtest, router, subtest.code, subtest.durationMinutes]);

  useEffect(() => {
    if (!attempt) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());

      if (getRemainingSeconds(attempt.expiresAt) <= 0) {
        window.clearInterval(timer);
        completeSubtest(true);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [attempt, completeSubtest]);

  const answeredCount = attempt ? Object.keys(attempt.responses).length : 0;
  const allItems = useMemo(
    () => Array.from({ length: subtest.itemCount }, (_, index) => index + 1),
    [subtest.itemCount],
  );
  const unansweredItems = useMemo(
    () => allItems.filter((itemNumber) => !attempt?.responses[itemNumber]),
    [allItems, attempt],
  );
  const currentItem = attempt?.currentItem ?? 1;
  const draftValue = draft ?? attempt?.responses[currentItem] ?? "";
  const question = getQuestion(subtest.code, currentItem);

  function moveTo(next: AttemptState, itemNumber: number) {
    setAttemptState(subtest.code, { ...next, currentItem: itemNumber });
    setDraft(null);
  }

  function handleAnswerSubmit() {
    if (!attempt || !draftValue) {
      return;
    }

    const answered: AttemptState = {
      ...attempt,
      responses: { ...attempt.responses, [attempt.currentItem]: draftValue },
      skippedItems: attempt.skippedItems.filter((item) => item !== attempt.currentItem),
    };
    const remainingUnanswered = allItems.filter((itemNumber) => !answered.responses[itemNumber]);

    if (attempt.currentItem === subtest.itemCount) {
      if (remainingUnanswered.length === 0) {
        setAttemptState(subtest.code, answered);
        completeSubtest(false);
        return;
      }

      moveTo(answered, remainingUnanswered[0]);
      return;
    }

    moveTo(answered, attempt.currentItem + 1);
  }

  function handleSkip() {
    if (!attempt) {
      return;
    }

    const skipped: AttemptState = {
      ...attempt,
      skippedItems: attempt.skippedItems.includes(attempt.currentItem)
        ? attempt.skippedItems
        : [...attempt.skippedItems, attempt.currentItem],
    };

    if (attempt.currentItem === subtest.itemCount) {
      const nextTarget = unansweredItems.find((itemNumber) => itemNumber !== attempt.currentItem);

      if (nextTarget === undefined) {
        setAttemptState(subtest.code, skipped);
        completeSubtest(false);
        return;
      }

      moveTo(skipped, nextTarget);
      return;
    }

    moveTo(skipped, attempt.currentItem + 1);
  }

  function handleJump(itemNumber: number) {
    if (!attempt) {
      return;
    }

    moveTo(attempt, itemNumber);
  }

  if (!attempt) {
    return (
      <section
        aria-busy="true"
        className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 text-sm text-[var(--text-secondary)]"
      >
        Memuat state sesi...
      </section>
    );
  }

  if (!question) {
    return (
      <section
        role="alert"
        className="rounded-2xl border border-[var(--status-error)] bg-[var(--surface-panel)] p-6 text-sm text-[var(--status-error)]"
      >
        Data soal {subtest.code} nomor {currentItem} tidak tersedia. Muat ulang sesi atau hubungi
        administrator tes.
      </section>
    );
  }

  const isCurrentAnswered = Boolean(attempt.responses[currentItem]);
  const isCurrentSkipped = attempt.skippedItems.includes(currentItem);
  const remainingSeconds = getDisplayRemainingSeconds(
    attempt.expiresAt,
    subtest.durationMinutes,
    now,
  );
  const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const seconds = String(remainingSeconds % 60).padStart(2, "0");

  return (
    <section className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <CourseRail currentCode={subtest.code} />
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <SessionTimer minutes={minutes} seconds={seconds} className="sticky top-4 z-30 xl:hidden" />
        <TestQuestionPanel
          state={{
            question,
            currentItem,
            totalItems: subtest.itemCount,
            answeredCount,
            status: isCurrentAnswered ? "answered" : isCurrentSkipped ? "skipped" : "pending",
            value: draftValue,
          }}
          onValueChange={setDraft}
          onSkip={handleSkip}
          onSubmit={handleAnswerSubmit}
        />

        <TestSessionSidebar
          state={{
            code: subtest.code,
            minutes,
            seconds,
            currentItem,
            allItems,
            unansweredCount: unansweredItems.length,
            responses: attempt.responses,
            skippedItems: attempt.skippedItems,
          }}
          onJump={handleJump}
          onComplete={() => completeSubtest(false)}
        />
      </div>
    </section>
  );
}
