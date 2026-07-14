import { AppShell } from "@/components/ui/app-shell";
import { PrototypeBadge } from "@/components/ui/prototype-badge";
import { GeScoringBoard } from "@/components/hr/ge-scoring-board";

export default async function HrGeScoringPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <AppShell
      eyebrow="Screen H3"
      title={`Skoring GE untuk ${sessionId}`}
      description="Prototype ini mensimulasikan workflow rubrik 0/1/2, penyimpanan scorer, dan kebutuhan alasan override sebelum calculate."
    >
      <section className="space-y-6">
        <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--accent-warm-soft)] p-6">
          <div className="flex flex-wrap gap-3">
            <PrototypeBadge tone="warning">Needs GE</PrototypeBadge>
            <PrototypeBadge>Item 61-76</PrototypeBadge>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
            Jawaban peserta tetap terlihat, tetapi keputusan skor harus memakai rubrik terkunci.
            Pada production flow, override wajib mencatat alasan dan actor.
          </p>
        </article>

        <GeScoringBoard sessionId={sessionId} />
      </section>
    </AppShell>
  );
}
