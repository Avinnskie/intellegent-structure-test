import { QuestionBankManager } from "@/components/hr/question-bank-manager";
import { AppShell } from "@/components/ui/app-shell";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { listQuestionBank } from "@/lib/server/content.ts";

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
