import { Badge } from "@/components/ui/badge";
import { formatPapiElapsed } from "@/lib/domain/papi-format.ts";
import type { PapiAnswerRow, PapiAnswerSheetDto } from "@/lib/server/papi-result-read.ts";

function OptionLine({
  code,
  text,
  factor,
  chosen,
}: {
  readonly code: "A" | "B";
  readonly text: string;
  readonly factor: string;
  readonly chosen: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${
        chosen ? "border-primary bg-accent" : "border-transparent opacity-60"
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid size-5 shrink-0 place-items-center rounded text-[11px] font-bold ${
          chosen ? "bg-primary text-white" : "bg-muted text-muted-foreground"
        }`}
      >
        {code}
      </span>
      <span className="text-sm leading-6 text-foreground">{text}</span>
      <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{factor}</span>
    </div>
  );
}

function AnswerCard({ answer }: { readonly answer: PapiAnswerRow }) {
  const unanswered = answer.selected === null;

  return (
    <li
      className={`rounded-xl border p-3.5 ${
        unanswered ? "border-dashed border-border bg-muted" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Nomor {answer.itemNumber}
        </span>
        {unanswered ? (
          <span className="text-[11px] text-muted-foreground">belum dijawab</span>
        ) : (
          <span className="font-mono text-[11px] font-semibold text-primary">
            → {answer.selectedFactor}
          </span>
        )}
      </div>

      <div className="mt-2.5 space-y-1.5">
        <OptionLine
          code="A"
          text={answer.optionAText}
          factor={answer.optionAFactor}
          chosen={answer.selected === "A"}
        />
        <OptionLine
          code="B"
          text={answer.optionBText}
          factor={answer.optionBFactor}
          chosen={answer.selected === "B"}
        />
      </div>
    </li>
  );
}

export function PapiAnswerSheet({ sheet }: { readonly sheet: PapiAnswerSheetDto }) {
  const complete = sheet.answeredCount === sheet.itemCount;

  return (
    <details className="rounded-xl border border-border bg-card p-6">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        Jawaban PAPI peserta ({sheet.answeredCount}/{sheet.itemCount})
      </summary>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant={complete ? "default" : "outline"}>
          {complete ? "Lengkap" : `Kurang ${sheet.itemCount - sheet.answeredCount} nomor`}
        </Badge>
        <Badge variant="outline">Durasi {formatPapiElapsed(sheet.elapsedSeconds)}</Badge>
        {sheet.resumeCount > 0 ? (
          <Badge variant="outline">Dilanjutkan {sheet.resumeCount}×</Badge>
        ) : null}
        <Badge variant="outline">{sheet.completedAt ? "Sudah dikirim" : "Belum dikirim"}</Badge>
      </div>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Huruf di kanan tiap pernyataan adalah faktor yang disumbangkan bila opsi itu dipilih.
        Pilihan peserta ditandai; opsi yang tidak dipilih ditampilkan pudar sebagai pembanding.
      </p>

      <ol className="mt-5 grid gap-3 lg:grid-cols-2">
        {sheet.answers.map((answer) => (
          <AnswerCard key={answer.itemNumber} answer={answer} />
        ))}
      </ol>
    </details>
  );
}
