"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The error envelope every API route emits (`lib/api/errors.ts`). Parsed defensively: this is the
 * one component that talks to the server before any session exists, so a proxy error page or a
 * network drop must degrade to a readable message, never a crash.
 */
type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.";

/** Codes where the participant should wait or re-check rather than being blocked outright. */
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
          router.push(result.nextRoute);
          return;
        }
        // A 200 without a usable route is a server bug; fail readable rather than navigate blind.
        setFeedbackTone("danger");
        setFeedback(NETWORK_ERROR_MESSAGE);
        return;
      }

      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      const errorCode = envelope.error?.code ?? "";
      setFeedbackTone(WARNING_CODES.has(errorCode) ? "warning" : "danger");
      // The server's message is participant-safe by contract (T11); anything else gets the generic.
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
      <div className="h-max min-w-0 w-full overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)]">
        <div className="grid min-w-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="lms-grid-pattern relative min-w-0 overflow-hidden bg-[var(--accent-primary)] px-6 py-10 text-white sm:px-10 sm:py-14">
            <div className="relative z-10 max-w-xl">
              <h2 className="mt-6 text-pretty text-[clamp(2.3rem,4vw,4rem)] font-bold leading-[1.03] tracking-[-0.055em]">
                Selesaikan Intelligenz Struktur Test (IST).
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-white/75">
                Ikuti tutorial, kerjakan sembilan subtes secara berurutan, dan amati soal dengan
                teliti.
              </p>

              <div className="mt-10 grid grid-cols-3 gap-3 border-t border-white/15 pt-6">
                {[
                  ["09", "Subtes"],
                  ["176", "Soal"],
                  ["72m", "Durasi"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <p className="font-mono text-xl font-semibold">{value}</p>
                    <p className="mt-1 text-xs text-white/65">{label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-20 -right-16 size-64 rounded-full border-[48px] border-white/5" />
          </div>

          <div className="min-w-0 p-6 sm:p-10 lg:p-12">
            <div className="mt-6 space-y-2">
              <h3 className="text-2xl font-bold tracking-[-0.035em] text-[var(--text-primary)]">
                Kode akses peserta
              </h3>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                Masukkan kode yang dikirim HR untuk melanjutkan sesi yang sudah terdaftar.
              </p>
            </div>

            <form className="mt-7 min-w-0 space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Kode akses</span>
                <input
                  className="min-w-0 w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-4 font-mono text-base uppercase tracking-[0.08em] text-[var(--text-primary)]"
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
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Memeriksa kode…" : "Verifikasi dan buka tutorial"}
              </button>
              {feedback ? (
                <p
                  role="alert"
                  className={`rounded-xl border px-4 py-3 text-sm leading-6 ${
                    feedbackTone === "danger"
                      ? "border-[var(--status-error)]/30 bg-[color-mix(in_srgb,var(--status-error)_8%,white)] text-[var(--status-error)]"
                      : feedbackTone === "warning"
                        ? "border-[var(--status-warning)]/30 bg-[color-mix(in_srgb,var(--status-warning)_10%,white)] text-[var(--status-warning)]"
                        : "border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-secondary)]"
                  }`}
                >
                  {feedback}
                </p>
              ) : null}
            </form>

            <div className="mt-7 border-t border-[var(--border-subtle)] pt-5">
              <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
                <Link className="text-[var(--accent-primary)] hover:underline" href="/login">
                  Masuk sebagai HR
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
