"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.";

const WARNING_CODES = new Set(["CODE_EXPIRED", "RATE_LIMITED"]);

export function AccessEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"info" | "danger" | "warning">("info");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/access-codes/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      if (response.ok) {
        const result = (await response.json()) as { nextRoute?: string };
        if (typeof result.nextRoute === "string" && result.nextRoute.startsWith("/test/")) {
          setFeedbackTone("info");
          setFeedback("Kode valid. Membuka tutorial…");
          // Form kode akses tidak perlu tersimpan di riwayat; kembali ke sana hanya
          // menghasilkan galat "kode sedang dipakai".
          router.replace(result.nextRoute);
          return;
        }
        setFeedbackTone("danger");
        setFeedback(NETWORK_ERROR_MESSAGE);
        return;
      }

      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      const errorCode = envelope.error?.code ?? "";
      setFeedbackTone(WARNING_CODES.has(errorCode) ? "warning" : "danger");
      setFeedback(envelope.error?.message ?? NETWORK_ERROR_MESSAGE);
    } catch {
      setFeedbackTone("danger");
      setFeedback(NETWORK_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 px-4 py-10 sm:py-14">
      <div className="h-max min-w-0 w-full overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid min-w-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="lms-grid-pattern relative min-w-0 overflow-hidden bg-primary px-6 py-10 text-white sm:px-10 sm:py-14">
            <div className="relative z-10 max-w-xl">
              <h2 className="mt-6 text-pretty text-[clamp(2.3rem,4vw,4rem)] font-bold leading-[1.03] tracking-[-0.055em]">
                Selesaikan Psychology Test.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-white/75">
                Ikuti tutorial, kerjakan sembilan subtes secara berurutan, dan amati soal dengan
                teliti.
              </p>
            </div>
            <div className="absolute -bottom-20 -right-16 size-64 rounded-full border-[48px] border-white/5" />
          </div>

          <div className="min-w-0 p-6 sm:p-10 lg:p-12">
            <div className="mt-6 space-y-2">
              <h3 className="text-2xl font-bold tracking-[-0.035em] text-foreground">
                Kode akses peserta
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                Masukkan kode yang dikirim untuk melanjutkan sesi yang sudah terdaftar.
              </p>
            </div>

            <form className="mt-7 min-w-0 space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-foreground">Kode akses</span>
                <input
                  className="min-w-0 w-full rounded-xl border border-border bg-background px-4 py-4 font-mono text-base uppercase tracking-[0.08em] text-foreground"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder="IST-XXXXXXXX"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  minLength={4}
                  maxLength={32}
                  aria-describedby="access-code-help"
                />
              </label>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Memeriksa kode…" : "Verifikasi dan buka tutorial"}
              </button>
              {feedback ? (
                <p
                  role="alert"
                  className={`rounded-xl border px-4 py-3 text-sm leading-6 ${
                    feedbackTone === "danger"
                      ? "border-[var(--destructive)]/30 bg-[color-mix(in_srgb,var(--destructive)_8%,white)] text-destructive"
                      : feedbackTone === "warning"
                        ? "border-[var(--color-amber-500, #f59e0b)]/30 bg-[color-mix(in_srgb,var(--color-amber-500, #f59e0b)_10%,white)] text-[var(--color-amber-500, #f59e0b)]"
                        : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {feedback}
                </p>
              ) : null}
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
