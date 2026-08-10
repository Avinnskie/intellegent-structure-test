import { notFound } from "next/navigation";
import { GeScoringBoard } from "@/components/hr/ge-scoring-board";
import { sessionStatusLabel } from "@/components/hr/session-status-label";
import { AppShell } from "@/components/ui/app-shell";
import { ApiError } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { listGeItems } from "@/lib/server/ge-scoring.ts";
import { getSessionDetail } from "@/lib/server/hr.ts";

export default async function HrGeScoringPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const db = getDb();
  const ctx = await requireHrUser(db);

  let detail;
  let geList;
  try {
    detail = await getSessionDetail(db, ctx, sessionId);
    geList = await listGeItems(db, ctx, sessionId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <AppShell title={`Skoring GE — ${detail.candidate.fullName}`}>
      <section className="space-y-6">
        <article className="rounded-xl border border-border bg-accent p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-foreground">
              {sessionStatusLabel(detail.status)}
            </span>
            <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
              16 soal GE
            </span>
          </div>
        </article>

        <GeScoringBoard
          sessionId={detail.sessionId}
          items={geList.items}
          isSessionScorable={detail.status === "needs_ge_scoring"}
        />
      </section>
    </AppShell>
  );
}
