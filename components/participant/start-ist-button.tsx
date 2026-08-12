"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartIstButton({ token }: { readonly token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${token}/papi/start-ist`, { method: "POST" });
      if (!response.ok) {
        setError("Bagian berikutnya belum dapat dibuka. Muat ulang halaman atau hubungi HR.");
        setPending(false);
        return;
      }
      router.replace(`/test/${token}`);
    } catch {
      setError("Koneksi terputus. Periksa jaringan lalu coba lagi.");
      setPending(false);
    }
  }

  return (
    <div className="mt-7">
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? "Membuka…" : "Mulai tes kemampuan"}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-center text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
