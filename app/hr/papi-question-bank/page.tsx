import { PapiQuestionBankManager } from "@/components/hr/papi-question-bank-manager";
import { AppShell } from "@/components/ui/app-shell";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { listPapiQuestionBank } from "@/lib/server/papi-content.ts";

export default async function HrPapiQuestionBankPage() {
  const db = getDb();
  await requireHrUser(db);
  const bank = await listPapiQuestionBank(db);

  return (
    <AppShell title="Bank soal PAPI">
      <PapiQuestionBankManager bank={bank} />
    </AppShell>
  );
}
