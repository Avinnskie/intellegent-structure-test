import { QuestionBankManager } from "@/components/hr/question-bank-manager";
import { AppShell } from "@/components/ui/app-shell";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { listQuestionBank } from "@/lib/server/content.ts";

/**
 * Real question bank: edit prompt/placeholder/option labels in place (typo fixes — visible to
 * running sessions by design), toggle active/inactive. Option CODES and item counts are fixed by
 * the form version; structural changes are Phase 6 (new form version).
 */
export default async function HrQuestionBankPage() {
  const db = getDb();
  await requireHrUser(db);
  const subtests = await listQuestionBank(db);

  return (
    <AppShell title="Bank soal">
      <QuestionBankManager subtests={subtests} />
    </AppShell>
  );
}
