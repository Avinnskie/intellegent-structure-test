import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PrototypeBadge } from "@/components/ui/prototype-badge";

export default async function HrSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <AppShell
      eyebrow="Screen H2"
      title={`Detail sesi ${sessionId}`}
      description="Screen ini memvalidasi identitas sesi, status kode, progress subtes, durasi, jawaban kosong, dan tindakan revoke/regenerate/pause/void."
    >
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]">
          <div className="flex flex-wrap gap-3">
            <PrototypeBadge tone="info">In progress</PrototypeBadge>
            <PrototypeBadge>IST-7K4M9Q2D</PrototypeBadge>
          </div>
          <div className="mt-6 space-y-4 text-sm text-[var(--text-secondary)]">
            <p>
              <strong className="text-[var(--text-primary)]">Peserta:</strong> Nadia Pratama
            </p>
            <p>
              <strong className="text-[var(--text-primary)]">Tujuan:</strong> Rekrutmen
            </p>
            <p>
              <strong className="text-[var(--text-primary)]">Subtes aktif:</strong> SE
            </p>
            <p>
              <strong className="text-[var(--text-primary)]">Insiden:</strong> reconnect 1x,
              autosave valid
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)]">
              Revoke kode
            </button>
            <button className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)]">
              Regenerate
            </button>
          </div>
        </article>

        <article className="space-y-5 rounded-2xl border border-[var(--border-default)] bg-[var(--accent-soft)] p-6">
          <ProgressBar label="Subtes selesai" value={1} total={9} />
          <ProgressBar label="Jawaban terisi" value={16} total={20} />
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Answered", "16"],
              ["Skipped", "2"],
              ["Unanswered", "2"],
              ["Duration", "04:21 / 06:00"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-4"
              >
                <p className="text-sm text-[var(--text-muted)]">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
              </div>
            ))}
          </div>
          <Link
            href="/hr/scoring/SES-018/ge"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white"
          >
            Buka GE scoring
          </Link>
        </article>
      </section>
    </AppShell>
  );
}
