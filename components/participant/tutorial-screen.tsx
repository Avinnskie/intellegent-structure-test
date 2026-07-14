"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CourseRail } from "@/components/participant/course-rail";
import { PrototypeBadge } from "@/components/ui/prototype-badge";
import { demoSession } from "@/lib/ist-data";
import { formatDuration, getFirstPendingSubtest, getSubtestByCode } from "@/lib/ist-logic";
import { loadCompletedSubtests } from "@/lib/session-store";

type TutorialScreenProps = {
  readonly subtestCode: string | null;
  readonly previousSubtest: string | null;
  readonly lockedSubtest: string | null;
};

export function TutorialScreen({
  subtestCode,
  previousSubtest,
  lockedSubtest,
}: TutorialScreenProps) {
  const router = useRouter();
  const subtest = getSubtestByCode(subtestCode);

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
    }
  }, [router, subtest.code]);

  return (
    <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <CourseRail currentCode={subtest.code} />
      <div className="grid gap-6">
        <article className="rounded-2xl flex flex-col justify-between border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]">
          <div className="">
            <div className="flex flex-wrap gap-3">
              <PrototypeBadge>Subtes {subtest.code}</PrototypeBadge>
            </div>
            <h2 className="mt-5 text-3xl font-bold tracking-[-0.04em] text-[var(--text-primary)]">
              {subtest.title}
            </h2>
            <p className="mt-3 text-base leading-7 text-[var(--text-secondary)]">
              {subtest.tutorialSummary}
            </p>

            {lockedSubtest ? (
              <div className="mt-6 rounded-xl border border-[var(--status-error)]/30 bg-[color-mix(in_srgb,var(--status-error)_8%,white)] p-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Subtes {lockedSubtest} sudah ditutup.
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                  Waktunya sudah habis atau sudah diselesaikan, jadi tidak dapat dibuka kembali.
                  Anda diarahkan ke subtes yang sedang berjalan.
                </p>
              </div>
            ) : null}

            {previousSubtest ? (
              <div className="mt-6 rounded-xl border border-[var(--border-default)] bg-[var(--accent-warm-soft)] p-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Subtes {previousSubtest} selesai.
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                  Jawaban terkunci. Peserta tidak dapat kembali ke subtes sebelumnya.
                </p>
              </div>
            ) : null}

            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-[var(--surface-base)] p-4">
                <dt className="text-sm text-[var(--text-muted)]">Jumlah soal</dt>
                <dd className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
                  {subtest.itemCount}
                </dd>
              </div>
              <div className="rounded-xl bg-[var(--surface-base)] p-4">
                <dt className="text-sm text-[var(--text-muted)]">Durasi</dt>
                <dd className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
                  {formatDuration(subtest.durationMinutes)}
                </dd>
              </div>
            </dl>

            {subtest.hasVideo ? (
              <div className="mt-6 overflow-hidden rounded-xl border border-[var(--border-default)]">
                <div className="flex aspect-video items-center justify-center bg-[var(--surface-strong)]">
                  <div className="text-center">
                    <span
                      aria-hidden="true"
                      className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--surface-panel)] text-xl shadow-[var(--shadow-subtle)]"
                    >
                      ▶
                    </span>
                    <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                      Video tutorial {subtest.code} (placeholder)
                    </p>
                  </div>
                </div>
                <p className="border-t border-[var(--border-subtle)] bg-[var(--surface-panel)] px-4 py-3 text-xs leading-5 text-[var(--text-muted)]">
                  Video buffering tidak mengurangi waktu subtes; timer baru berjalan setelah tombol
                  mulai ditekan.
                </p>
              </div>
            ) : null}

            <div className="mt-6 rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-base)] p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Contoh non-scored
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {subtest.examplePrompt}
              </p>
              <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
                Tombol <strong>Lewati</strong> menandai soal sebagai `skipped`. Peserta dapat
                kembali selama timer subtes masih aktif.
              </p>
            </div>
          </div>

          <Link
            href={`/test/session?code=${demoSession.accessCode}&subtest=${subtest.code}`}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[#4B0D61] px-5 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-[#350444]"
          >
            Mulai subtes {subtest.code}
          </Link>
        </article>

        {/* <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)] h-max">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
                {demoParticipant.name}
              </h3>
            </div>
            <div className="text-right font-mono text-xs text-[var(--text-secondary)]">
              <p>{demoSession.id}</p>
              <p>{demoSession.accessCode}</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/test/session?code=${demoSession.accessCode}&subtest=${subtest.code}`}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-[var(--accent-hover)]"
            >
              Mulai subtes {subtest.code}
            </Link>
          </div>
        </article> */}
      </div>
    </section>
  );
}
