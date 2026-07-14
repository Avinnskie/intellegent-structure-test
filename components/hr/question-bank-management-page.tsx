import { QuestionBankEditor } from "@/components/hr/question-bank-editor";
import { AppShell } from "@/components/ui/app-shell";

type QuestionBankManagementPageProps = {
  readonly eyebrow: string;
};

export function QuestionBankManagementPage({ eyebrow }: QuestionBankManagementPageProps) {
  return (
    <AppShell
      eyebrow={eyebrow}
      title="Bank soal dan versi subtes"
      description="Buat draft dari versi aktif, perbarui metadata subtes, dan tambahkan soal tanpa mengubah sesi peserta yang sedang berjalan."
    >
      <QuestionBankEditor />
    </AppShell>
  );
}
