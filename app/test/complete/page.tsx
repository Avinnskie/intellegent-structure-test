import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { PrototypeBadge } from "@/components/ui/prototype-badge";
import { prototypeLabel } from "@/lib/ist-data";

export default function CompletePage() {
  return (
    <AppShell title="Seluruh Intelligenz Struktur Test telah selesai">
      <section className="flex flex-col gap-6">
        <article className="rounded-2xl border border-[var(--border-default)] bg-[#4B0D61]/10 p-6">
          <h2 className="mt-5 text-3xl font-bold text-black tracking-[-0.04em]">
            Sesi anda telah selesai
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-black">
            Terima kasih telah menyelesaikan seluruh subtes. Hasil tes akan diproses dan dapat
            diakses oleh HR.
          </p>
        </article>
        <article>
          <div className="mt-5 flex flex-col gap-3">
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[#4B0D61] hover:bg-[#3a0a4a] px-5 text-sm font-semibold text-white"
            >
              Kembali ke halaman kode
            </Link>
            {/* <Link
              href="/hr/results/SES-018"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)]"
            >
              Lihat hasil demo HR
            </Link> */}
          </div>
        </article>
      </section>
    </AppShell>
  );
}
