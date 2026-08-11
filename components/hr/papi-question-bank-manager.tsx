"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { PAPI_FACTOR_CODES, PAPI_MAX_FACTOR_SCORE } from "@/lib/papi-factors.ts";
import type {
  PapiBankItemDto,
  PapiFactorLegendDto,
  PapiQuestionBankDto,
} from "@/lib/server/papi-content.ts";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR = "Tidak dapat menghubungi server. Coba lagi.";

type Draft = {
  optionAText: string;
  optionAFactor: string;
  optionBText: string;
  optionBFactor: string;
};

type SaveResponse = {
  keyValid: boolean;
  keyProblems: string[];
  legend: PapiFactorLegendDto[];
};

function FactorSelect({
  value,
  onChange,
  disabled,
  label,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
  readonly label: string;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? value)} disabled={disabled}>
      <SelectTrigger className="w-20" aria-label={label}>
        <SelectValue>{(current: string | null) => current ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PAPI_FACTOR_CODES.map((code) => (
          <SelectItem key={code} value={code} label={code}>
            {code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ItemEditor({
  item,
  editable,
  onSaved,
}: {
  readonly item: PapiBankItemDto;
  readonly editable: boolean;
  readonly onSaved: (result: SaveResponse) => void;
}) {
  const { push } = useToast();
  const [saved, setSaved] = useState<Draft>({
    optionAText: item.optionAText,
    optionAFactor: item.optionAFactor,
    optionBText: item.optionBText,
    optionBFactor: item.optionBFactor,
  });
  const [draft, setDraft] = useState<Draft>(saved);
  const [isBusy, setIsBusy] = useState(false);

  const dirty =
    draft.optionAText !== saved.optionAText ||
    draft.optionAFactor !== saved.optionAFactor ||
    draft.optionBText !== saved.optionBText ||
    draft.optionBFactor !== saved.optionBFactor;

  async function save() {
    setIsBusy(true);
    try {
      const response = await fetch(`/api/hr/papi-question-bank/items/${item.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (response.ok) {
        const payload = (await response.json()) as SaveResponse;
        setSaved(draft);
        push("success", `Nomor ${item.itemNumber} tersimpan.`);
        onSaved(payload);
        return;
      }
      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      push("error", envelope.error?.message ?? NETWORK_ERROR);
    } catch {
      push("error", NETWORK_ERROR);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card className={dirty ? "border-primary" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">Nomor {item.itemNumber}</CardTitle>
          {dirty ? (
            <Badge variant="outline" className="text-primary">
              Belum disimpan
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {(["A", "B"] as const).map((option) => {
          const textKey = option === "A" ? "optionAText" : "optionBText";
          const factorKey = option === "A" ? "optionAFactor" : "optionBFactor";
          return (
            <div key={option} className="grid gap-2">
              <Label htmlFor={`papi-${item.id}-${option}`} className="text-xs">
                Pernyataan {option}
              </Label>
              <div className="flex items-start gap-2">
                <Textarea
                  id={`papi-${item.id}-${option}`}
                  rows={2}
                  disabled={!editable || isBusy}
                  value={draft[textKey]}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [textKey]: event.target.value }))
                  }
                />
                <FactorSelect
                  label={`Faktor opsi ${option} nomor ${item.itemNumber}`}
                  value={draft[factorKey]}
                  disabled={!editable || isBusy}
                  onChange={(next) => setDraft((current) => ({ ...current, [factorKey]: next }))}
                />
              </div>
            </div>
          );
        })}

        {editable ? (
          <div className="flex justify-end gap-2">
            {dirty ? (
              <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => setDraft(saved)}>
                Batalkan
              </Button>
            ) : null}
            <Button size="sm" disabled={!dirty || isBusy} onClick={() => void save()}>
              {isBusy ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function PapiQuestionBankManager({ bank }: { readonly bank: PapiQuestionBankDto }) {
  const [problems, setProblems] = useState<readonly string[]>(bank.keyProblems);
  const [legend, setLegend] = useState<readonly PapiFactorLegendDto[]>(bank.legend);
  const [query, setQuery] = useState("");

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return bank.items;
    return bank.items.filter(
      (item) =>
        String(item.itemNumber) === needle ||
        item.optionAText.toLowerCase().includes(needle) ||
        item.optionBText.toLowerCase().includes(needle) ||
        item.optionAFactor.toLowerCase() === needle ||
        item.optionBFactor.toLowerCase() === needle,
    );
  }, [bank.items, query]);

  if (!bank.formVersionId) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Belum ada form PAPI. Jalankan <code>npm run db:seed</code> terlebih dahulu.
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">{bank.title}</CardTitle>
              <CardDescription className="mt-1">
                {bank.itemCount} nomor · versi {bank.version} · engine {bank.engineVersion} ·
                dipakai {bank.sessionsUsing} sesi
              </CardDescription>
            </div>
            <Badge variant={bank.editable ? "default" : "outline"}>
              {bank.editable ? "Dapat disunting" : "Terkunci"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* {bank.lockedReason ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-foreground">
              <strong className="font-semibold">Soal sedang terkunci.</strong> {bank.lockedReason}{" "}
              Peserta membaca teks soal langsung dari bank ini, sehingga menyuntingnya sekarang akan
              menggeser pertanyaan di tengah pengerjaan.
            </p>
          ) : null} */}

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Sebaran huruf faktor — masing-masing wajib {PAPI_MAX_FACTOR_SCORE}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {legend.map((factor) => {
                const ok = factor.occurrences === PAPI_MAX_FACTOR_SCORE;
                return (
                  <span
                    key={factor.code}
                    title={`${factor.name} (${factor.kind})`}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs tabular-nums ${
                      ok
                        ? "border-border text-muted-foreground"
                        : "border-destructive font-semibold text-destructive"
                    }`}
                  >
                    <span className="font-mono font-bold">{factor.code}</span>
                    {factor.occurrences}
                  </span>
                );
              })}
            </div>
          </div>

          {problems.length > 0 ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm font-semibold text-destructive">
                Kunci belum sah — {problems.length} masalah
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Suntingan tetap tersimpan, tetapi lembar jawaban tidak dapat diskor selama kunci
                belum kembali sah.
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {problems.slice(0, 8).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
              {problems.length > 8 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  dan {problems.length - 8} lainnya
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">
              Kunci sah: 90 nomor, tiap huruf 9 kali, seluruh pasangan sejenis dan unik.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-2">
        <Label htmlFor="papi-bank-search">Cari nomor, teks, atau huruf faktor</Label>
        <Input
          id="papi-bank-search"
          value={query}
          placeholder="misalnya 42, atau G, atau kata dalam pernyataan"
          onChange={(event) => setQuery(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {visibleItems.length} dari {bank.items.length} nomor ditampilkan
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleItems.map((item) => (
          <ItemEditor
            key={item.id}
            item={item}
            editable={bank.editable}
            onSaved={(result) => {
              setProblems(result.keyProblems);
              setLegend(result.legend);
            }}
          />
        ))}
      </div>
    </section>
  );
}
