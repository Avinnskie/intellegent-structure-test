import { CourseRail } from "@/components/participant/course-rail";
import { StartSubtestButton } from "@/components/participant/start-subtest-button";
import type { SubtestCode } from "@/lib/ist-subtests";

/**
 * Shapes mirror `SessionStateDto.currentSubtest`/`.tutorial` (T12). Declared here rather than
 * imported so this stays a pure presentational component — the server page owns the service import.
 */
type TutorialScreenProps = {
  readonly token: string;
  readonly subtest: {
    readonly code: SubtestCode;
    readonly title: string;
    readonly itemCount: number;
    readonly durationSeconds: number;
  };
  readonly tutorial: {
    readonly textContent: string;
    readonly videoReference: string | null;
  };
  /** Signed playback URL for the tutorial video, minted by the server page; null = no video. */
  readonly videoUrl?: string | null;
};

// Referenced by the duration card that is currently commented out below — kept for its return.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatDurationSeconds(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  if (minutes === 0) {
    return `${seconds} detik`;
  }
  return seconds === 0 ? `${minutes} menit` : `${minutes} menit ${seconds} detik`;
}

/**
 * Server-rendered tutorial for the subtest the session is actually on. All content is the pinned
 * tutorial version resolved by `getSessionState`; nothing here reads demo data or client stores,
 * and the timer badge is honest — no attempt exists until the start button POSTs.
 */
export function TutorialScreen({ token, subtest, tutorial, videoUrl = null }: TutorialScreenProps) {
  return (
    <section className="w-full grid gap-6 lg:grid-cols-[280px_1fr]">
      <CourseRail currentCode={subtest.code} />
      <div className="grid gap-6">
        <article className="flex flex-col justify-between rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
          <div>
            <div className="flex justify-between items-center">
              <div className="space-x-2">
                <span className="inline-flex items-center rounded-full bg-[var(--accent-warm-soft)] px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
                  Subtes {subtest.code}
                </span>
                <span className="inline-flex items-center rounded-full border border-[var(--border-default)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                  Timer belum dimulai
                </span>
                <h2 className="mt-5 text-3xl font-bold tracking-[-0.04em] text-[var(--text-primary)]">
                  {subtest.title}
                </h2>
              </div>
              {/* <dl className="mt-6 gap-4">
                <div className="rounded-xl bg-[var(--surface-base)] p-4">
                  <dt className="text-sm text-[var(--text-muted)]">Jumlah soal</dt>
                  <dd className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
                    {subtest.itemCount}
                  </dd>
                </div>
                <div className="rounded-xl bg-[var(--surface-base)] p-4">
                  <dt className="text-sm text-[var(--text-muted)]">Durasi</dt>
                  <dd className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
                    {formatDurationSeconds(subtest.durationSeconds)}
                  </dd>
                </div>
              </dl> */}
            </div>
            <p className="mt-3 whitespace-pre-line text-base leading-7 text-[var(--text-secondary)]">
              {tutorial.textContent}
            </p>

            {videoUrl ? (
              <div className="mt-6 overflow-hidden rounded-xl border border-[var(--border-default)]">
                {/* Video vs gambar diputuskan dari ekstensi PATH tersimpan (URL bertanda tangan
                    membawa query, jadi jangan menebak dari URL-nya). */}
                {/\.(png|jpe?g|webp)$/i.test(tutorial.videoReference ?? "") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL, next/image cannot optimize it
                  <img
                    src={videoUrl}
                    alt={`Ilustrasi tutorial ${subtest.code}`}
                    className="max-h-96 w-full bg-[var(--surface-base)] object-contain"
                  />
                ) : (
                  <video
                    src={videoUrl}
                    controls
                    preload="metadata"
                    className="aspect-video w-full bg-black"
                  >
                    Peramban Anda tidak mendukung pemutar video.
                  </video>
                )}
                <p className="border-t border-[var(--border-subtle)] bg-[var(--surface-panel)] px-4 py-3 text-xs leading-5 text-[var(--text-muted)]">
                  Materi tutorial tidak mengurangi waktu subtes; timer baru berjalan setelah tombol
                  mulai ditekan.
                </p>
              </div>
            ) : null}
          </div>

          <StartSubtestButton token={token} code={subtest.code} />
        </article>
      </div>
    </section>
  );
}
