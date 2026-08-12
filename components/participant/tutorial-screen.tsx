import { CourseRail } from "@/components/participant/course-rail";
import { StartSubtestButton } from "@/components/participant/start-subtest-button";
import { RichText } from "@/components/ui/rich-text";
import type { SubtestCode } from "@/lib/ist-subtests";

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
  readonly videoUrl?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatDurationSeconds(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  if (minutes === 0) {
    return `${seconds} detik`;
  }
  return seconds === 0 ? `${minutes} menit` : `${minutes} menit ${seconds} detik`;
}

export function TutorialScreen({ token, subtest, tutorial, videoUrl = null }: TutorialScreenProps) {
  return (
    <section className="w-full grid gap-6 lg:grid-cols-[280px_1fr]">
      <CourseRail currentCode={subtest.code} />
      <div className="grid gap-6">
        <article className="flex flex-col justify-between rounded-xl border border-border bg-card p-6">
          <div>
            <div className="flex justify-between items-center">
              <div className="space-x-2">
                <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-foreground">
                  Subtes {subtest.code}
                </span>
                <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
                  Timer belum dimulai
                </span>
                <h2 className="mt-5 text-3xl font-bold tracking-[-0.04em] text-foreground">
                  {subtest.title}
                </h2>
              </div>
              {}
            </div>
            <RichText
              value={tutorial.textContent}
              className="mt-3 text-base leading-7 text-muted-foreground"
            />

            {videoUrl ? (
              <div className="mt-6 overflow-hidden rounded-xl border border-border">
                {}
                {/\.(png|jpe?g|webp)$/i.test(tutorial.videoReference ?? "") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL, next/image cannot optimize it
                  <img
                    src={videoUrl}
                    alt={`Ilustrasi tutorial ${subtest.code}`}
                    className="max-h-96 w-full bg-background object-contain"
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
                <p className="border-t border-border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">
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
