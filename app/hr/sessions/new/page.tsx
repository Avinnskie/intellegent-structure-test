import { AppShell } from "@/components/ui/app-shell";
import { SessionCreateForm } from "@/components/hr/session-create-form";

export default function HrSessionNewPage() {
  return (
    <AppShell
      eyebrow="Session Registry"
      title="Buat sesi dan kode akses"
      description="Pilih peserta, tetapkan tanggal dan tujuan tes, lalu generate kode unik. Kode memakai karakter yang tidak ambigu dan langsung aktif tanpa approval."
    >
      <section>
        <SessionCreateForm />
      </section>
    </AppShell>
  );
}
