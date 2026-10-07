"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CompleteSubtestButton } from "@/components/participant/complete-subtest-button";
import type { SubtestCode } from "@/lib/ist-subtests";
import { readSubtestSessionResponses } from "@/lib/participant-answer-session";

type PendingItem = {
  readonly localNumber: number;
  readonly status: "unanswered" | "skipped";
};

type SubtestReviewProps = {
  readonly token: string;
  readonly code: SubtestCode;
  readonly serverPending: readonly PendingItem[];
};

export function SubtestReview({ token, code, serverPending }: SubtestReviewProps) {
  const [pending, setPending] = useState(serverPending);

  useEffect(() => {
    const byLocalNumber = new Map(serverPending.map((item) => [item.localNumber, item]));
    for (const response of readSubtestSessionResponses(window.sessionStorage, token, code)) {
      if (response.status === "answered") {
        byLocalNumber.delete(response.localNumber);
      } else {
        byLocalNumber.set(response.localNumber, {
          localNumber: response.localNumber,
          status: "skipped",
        });
      }
    }
    const frame = window.requestAnimationFrame(() => {
      setPending(
        [...byLocalNumber.values()].sort((left, right) => left.localNumber - right.localNumber),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [token, code, serverPending]);

  return (
    <section className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-8">
        <h1 className="text-2xl font-bold tracking-[-0.035em] text-foreground">
          Periksa sebelum menutup subtes {code}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Setelah subtes ditutup, seluruh jawaban dikirim dan dikunci. Soal yang belum dijawab
          dinilai 0.
        </p>

        {pending.length > 0 ? (
          <div className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {pending.length} soal belum dijawab
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {pending.map((item) => (
                <Link
                  key={item.localNumber}
                  href={`/test/${token}/question/${code}/${item.localNumber}`}
                  className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-semibold hover:bg-muted ${
                    item.status === "skipped"
                      ? "border-[var(--color-amber-500, #f59e0b)] text-[var(--color-amber-500, #f59e0b)]"
                      : "border-border text-foreground"
                  }`}
                >
                  {item.localNumber}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-6 rounded-xl bg-background p-4 text-sm leading-6 text-muted-foreground">
            Semua soal sudah dijawab.
          </p>
        )}

        <div className="mt-8 border-t border-border pt-6">
          <CompleteSubtestButton token={token} code={code} unansweredCount={pending.length} />
        </div>
      </div>
    </section>
  );
}
