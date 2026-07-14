import { AppShell } from "@/components/ui/app-shell";

export default function AdminUsersPage() {
  return (
    <AppShell
      eyebrow="Admin"
      title="Pengelolaan akun HR dan konfigurasi tutorial"
      description="Prototype admin disediakan tipis untuk memvalidasi struktur route Super Admin tanpa autentikasi produksi."
    >
      <section className="grid gap-6 md:grid-cols-2">
        {[
          ["Users", "Aktif/nonaktif HR Admin, role, dan last login."],
          ["Tutorials", "Versioning teks/video tutorial per subtes."],
          ["Bank soal", "Draft versi subtes, tambah soal, review, dan publikasi."],
          ["Settings", "Konfigurasi teknis, CSP, dan parameter prototype."],
          ["Audit", "Ekspor aktivitas lihat, nilai, finalize, dan download."],
        ].map(([title, detail]) => (
          <article
            key={title}
            className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]"
          >
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
              {title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
