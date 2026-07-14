import { AppShell } from "@/components/ui/app-shell";
import { ParticipantCreateForm } from "@/components/hr/participant-create-form";

export default function HrParticipantNewPage() {
  return (
    <AppShell
      eyebrow="Participant Registry"
      title="Tambah peserta"
      description="Peserta tidak membuat akun sendiri. HR mendaftarkan identitas minimum yang dibutuhkan untuk sesi dan norma usia."
    >
      <section>
        <ParticipantCreateForm />
      </section>
    </AppShell>
  );
}
