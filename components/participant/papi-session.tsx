"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PapiStopwatch } from "./papi-stopwatch";

export type PapiSessionItem = {
  readonly number: number;
  readonly optionAText: string;
  readonly optionBText: string;
  readonly selected: "A" | "B" | null;
};

type PapiSessionProps = {
  readonly token: string;
  readonly items: readonly PapiSessionItem[];
  readonly itemCount: number;
  readonly initialElapsedSeconds: number;
};

const HEARTBEAT_MS = 30_000;
const PAGE_SIZE = 10;

type SaveState = "idle" | "menyimpan" | "tersimpan" | "gagal";

export function PapiSession({ token, items, itemCount, initialElapsedSeconds }: PapiSessionProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<number, "A" | "B" | null>>(() =>
    Object.fromEntries(items.map((item) => [item.number, item.selected])),
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(initialElapsedSeconds);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showUnanswered, setShowUnanswered] = useState(false);
  const pendingSaves = useRef(0);

  const answeredCount = useMemo(
    () => Object.values(answers).filter((value) => value !== null).length,
    [answers],
  );

  const unanswered = useMemo(
    () => items.filter((item) => answers[item.number] == null).map((item) => item.number),
    [items, answers],
  );

  const pageCount = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const complete = unanswered.length === 0;

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/sessions/${token}/papi/heartbeat`, { method: "POST" });
        if (!response.ok) return;
        const payload = (await response.json()) as { elapsedSeconds: number };
        setElapsedSeconds(payload.elapsedSeconds);
      } catch {}
    }, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [token]);

  const save = useCallback(
    async (itemNumber: number, option: "A" | "B") => {
      pendingSaves.current += 1;
      setSaveState("menyimpan");
      try {
        const response = await fetch(`/api/sessions/${token}/papi/responses/${itemNumber}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ option }),
        });
        if (!response.ok) {
          setSaveState("gagal");
          return;
        }
        const payload = (await response.json()) as { elapsedSeconds: number };
        setElapsedSeconds(payload.elapsedSeconds);
        pendingSaves.current -= 1;
        if (pendingSaves.current <= 0) {
          pendingSaves.current = 0;
          setSaveState("tersimpan");
        }
      } catch {
        setSaveState("gagal");
      }
    },
    [token],
  );

  function choose(itemNumber: number, option: "A" | "B") {
    setAnswers((current) => ({ ...current, [itemNumber]: option }));
    void save(itemNumber, option);
  }

  async function submit() {
    if (!complete) {
      setShowUnanswered(true);
      const firstMissing = unanswered[0];
      if (firstMissing !== undefined) {
        setPage(Math.floor((firstMissing - 1) / PAGE_SIZE));
      }
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch(`/api/sessions/${token}/papi/complete`, { method: "POST" });
      if (!response.ok) {
        setSubmitError("Kuesioner belum dapat dikirim. Muat ulang halaman lalu coba lagi.");
        setSubmitting(false);
        return;
      }
      // PAPI bukan lagi bagian terakhir baterai — IST menyusul setelahnya.
      // Tujuan diambil dari status yang dikembalikan server, bukan ditulis
      // tetap di sini, supaya perubahan urutan berikutnya tidak perlu menyentuh
      // komponen ini lagi.
      const dto = (await response.json()) as { sessionStatus?: string };
      router.replace(
        dto.sessionStatus === "finished" ? `/test/${token}/complete` : `/test/${token}/papi`,
      );
    } catch {
      setSubmitError("Koneksi terputus. Periksa jaringan lalu coba lagi.");
      setSubmitting(false);
    }
  }

  async function pause() {
    try {
      await fetch(`/api/sessions/${token}/papi/pause`, { method: "POST" });
    } catch {}
    router.replace(`/test/${token}/papi`);
  }

  return (
    <div className="w-full max-w-3xl">
      <header className="sticky top-0 z-10 -mx-1 bg-card/60 backdrop-blur-2xl px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold tracking-[-0.02em] text-foreground">
              Kuesioner kepribadian
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Terjawab {answeredCount} dari {itemCount}
            </p>
          </div>
          <PapiStopwatch baselineSeconds={elapsedSeconds} />
        </div>

        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={answeredCount}
          aria-valuemin={0}
          aria-valuemax={itemCount}
          aria-label="Kemajuan pengisian"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${(answeredCount / itemCount) * 100}%` }}
          />
        </div>

        <p className="mt-2 text-right text-xs text-muted-foreground">
          {saveState === "menyimpan"
            ? "Menyimpan…"
            : saveState === "tersimpan"
              ? "Tersimpan"
              : saveState === "gagal"
                ? "Gagal menyimpan — periksa koneksi"
                : " "}
        </p>
      </header>

      <ol className="mt-5 space-y-4">
        {pageItems.map((item) => {
          const selected = answers[item.number] ?? null;
          const missing = showUnanswered && selected === null;
          return (
            <li
              key={item.number}
              className={`rounded-xl border p-5 ${
                missing ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
              }`}
            >
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Nomor {item.number}
                  {missing ? " · belum dijawab" : ""}
                </legend>

                <div className="mt-3 space-y-2">
                  {(["A", "B"] as const).map((option) => {
                    const text = option === "A" ? item.optionAText : item.optionBText;
                    const active = selected === option;
                    return (
                      <label
                        key={option}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                          active ? "border-primary bg-accent" : "border-border hover:bg-muted"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`papi-item-${item.number}`}
                          value={option}
                          checked={active}
                          onChange={() => choose(item.number, option)}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={`grid size-6 shrink-0 place-items-center rounded-md text-xs font-bold ${
                            active ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {option}
                        </span>
                        <span className="text-sm leading-6 text-foreground">{text}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>

      <nav className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          disabled={page === 0}
          className="h-11 rounded-xl border border-border px-5 text-sm font-semibold text-foreground disabled:opacity-40"
        >
          Sebelumnya
        </button>
        <span className="text-xs text-muted-foreground">
          Halaman {page + 1} dari {pageCount}
        </span>
        <button
          type="button"
          onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
          disabled={page >= pageCount - 1}
          className="h-11 rounded-xl border border-border px-5 text-sm font-semibold text-foreground disabled:opacity-40"
        >
          Berikutnya
        </button>
      </nav>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        {showUnanswered && unanswered.length > 0 ? (
          <p role="alert" className="mb-4 text-sm leading-6 text-muted-foreground">
            Masih ada <strong className="font-semibold">{unanswered.length} nomor</strong> yang
            belum dijawab: {unanswered.slice(0, 12).join(", ")}
            {unanswered.length > 12 ? ", …" : ""}. Semua nomor wajib terisi.
          </p>
        ) : null}

        <div className="flex">
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="h-12 w-full flex-1 rounded-xl bg-primary px-6 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Mengirim…" : `Kirim kuesioner (${answeredCount}/${itemCount})`}
          </button>
        </div>

        {submitError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
