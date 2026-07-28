import { ParticipantManager } from "@/components/hr/participant-manager";
import { AppShell } from "@/components/ui/app-shell";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { listCandidates } from "@/lib/server/hr.ts";

export default async function HrParticipantsPage() {
  const db = getDb();
  const ctx = await requireHrUser(db);
  const candidates = await listCandidates(db, ctx);

  return (
    <AppShell title="Daftar peserta">
      <ParticipantManager candidates={candidates} />
    </AppShell>
  );
}
