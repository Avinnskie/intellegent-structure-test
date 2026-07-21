import { TutorialManager } from "@/components/hr/tutorial-manager";
import { AppShell } from "@/components/ui/app-shell";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { listTutorials } from "@/lib/server/content.ts";

/** Real tutorial versioning: draft → publish (previous archived); published rows are immutable. */
export default async function HrTutorialsPage() {
  const db = getDb();
  await requireHrUser(db);
  const subtests = await listTutorials(db);

  return (
    <AppShell title="Pengelolaan tutorial subtes">
      <TutorialManager subtests={subtests} />
    </AppShell>
  );
}
