import {
  asPapiFactorCode,
  PAPI_FACTOR_CODES,
  PAPI_ITEM_COUNT,
  PAPI_MAX_FACTOR_SCORE,
  type PapiFactorCode,
} from "../papi-factors.ts";
import { papiFactor } from "./official-papi.ts";

/**
 * Kunci PAPI tidak bebas disunting.
 *
 * Instrumen ini hanya sah bila tiap huruf faktor muncul persis 9 kali di antara
 * 180 opsi, dan tiap nomor mempertemukan dua huruf sejenis (Role lawan Role,
 * atau Need lawan Need). Melanggar itu membuat skor faktor bisa melampaui 9 dan
 * profil ipsatifnya kehilangan makna — kegagalan yang tidak terlihat sampai
 * berbulan-bulan kemudian. Karena itu setiap penyuntingan divalidasi utuh,
 * bukan per baris.
 */

export type PapiDraftItem = {
  readonly itemNumber: number;
  readonly optionAText: string;
  readonly optionAFactor: string;
  readonly optionBText: string;
  readonly optionBFactor: string;
};

export type PapiKeyViolation =
  | { readonly kind: "item_count"; readonly actual: number }
  | { readonly kind: "item_numbering"; readonly missing: readonly number[] }
  | { readonly kind: "unknown_factor"; readonly itemNumber: number; readonly factor: string }
  | { readonly kind: "empty_text"; readonly itemNumber: number; readonly option: "A" | "B" }
  | {
      readonly kind: "same_factor_both_options";
      readonly itemNumber: number;
      readonly factor: string;
    }
  | {
      readonly kind: "mixed_role_need";
      readonly itemNumber: number;
      readonly factorA: string;
      readonly factorB: string;
    }
  | {
      readonly kind: "duplicate_pair";
      readonly itemNumbers: readonly number[];
      readonly pair: string;
    }
  | {
      readonly kind: "factor_frequency";
      readonly factor: PapiFactorCode;
      readonly actual: number;
      readonly expected: number;
    };

export type PapiKeyValidation = {
  readonly valid: boolean;
  readonly violations: readonly PapiKeyViolation[];
  /** Sebaran kemunculan tiap huruf, untuk ditampilkan sebagai indikator di UI. */
  readonly frequencies: Readonly<Record<PapiFactorCode, number>>;
};

export function describePapiKeyViolation(violation: PapiKeyViolation): string {
  switch (violation.kind) {
    case "item_count":
      return `Jumlah item harus ${PAPI_ITEM_COUNT}, saat ini ${violation.actual}.`;
    case "item_numbering":
      return `Nomor item tidak lengkap: ${violation.missing.join(", ")}.`;
    case "unknown_factor":
      return `Nomor ${violation.itemNumber} memakai huruf faktor tidak dikenal: "${violation.factor}".`;
    case "empty_text":
      return `Nomor ${violation.itemNumber} opsi ${violation.option} tidak boleh kosong.`;
    case "same_factor_both_options":
      return `Nomor ${violation.itemNumber} memakai huruf ${violation.factor} pada kedua opsi.`;
    case "mixed_role_need":
      return (
        `Nomor ${violation.itemNumber} mempertemukan ${violation.factorA} dan ${violation.factorB} ` +
        "yang berbeda jenis. Pasangan wajib Role lawan Role atau Need lawan Need."
      );
    case "duplicate_pair":
      return `Pasangan ${violation.pair} muncul lebih dari sekali: nomor ${violation.itemNumbers.join(", ")}.`;
    case "factor_frequency":
      return `Huruf ${violation.factor} muncul ${violation.actual} kali, seharusnya ${violation.expected}.`;
  }
}

function emptyFrequencies(): Record<PapiFactorCode, number> {
  return Object.fromEntries(PAPI_FACTOR_CODES.map((code) => [code, 0])) as Record<
    PapiFactorCode,
    number
  >;
}

export function validatePapiKey(items: readonly PapiDraftItem[]): PapiKeyValidation {
  const violations: PapiKeyViolation[] = [];
  const frequencies = emptyFrequencies();

  if (items.length !== PAPI_ITEM_COUNT) {
    violations.push({ kind: "item_count", actual: items.length });
  }

  const seenNumbers = new Set(items.map((item) => item.itemNumber));
  const missing = Array.from({ length: PAPI_ITEM_COUNT }, (_, index) => index + 1).filter(
    (number) => !seenNumbers.has(number),
  );
  if (missing.length > 0) {
    violations.push({ kind: "item_numbering", missing });
  }

  const pairOwners = new Map<string, number[]>();

  for (const item of items) {
    const codeA = asPapiFactorCode(item.optionAFactor);
    const codeB = asPapiFactorCode(item.optionBFactor);

    if (item.optionAText.trim() === "") {
      violations.push({ kind: "empty_text", itemNumber: item.itemNumber, option: "A" });
    }
    if (item.optionBText.trim() === "") {
      violations.push({ kind: "empty_text", itemNumber: item.itemNumber, option: "B" });
    }

    if (codeA === null) {
      violations.push({
        kind: "unknown_factor",
        itemNumber: item.itemNumber,
        factor: item.optionAFactor,
      });
    }
    if (codeB === null) {
      violations.push({
        kind: "unknown_factor",
        itemNumber: item.itemNumber,
        factor: item.optionBFactor,
      });
    }
    if (codeA === null || codeB === null) {
      continue;
    }

    frequencies[codeA] += 1;
    frequencies[codeB] += 1;

    if (codeA === codeB) {
      violations.push({
        kind: "same_factor_both_options",
        itemNumber: item.itemNumber,
        factor: codeA,
      });
      continue;
    }

    if (papiFactor(codeA).kind !== papiFactor(codeB).kind) {
      violations.push({
        kind: "mixed_role_need",
        itemNumber: item.itemNumber,
        factorA: codeA,
        factorB: codeB,
      });
    }

    const pair = [codeA, codeB].sort().join("-");
    pairOwners.set(pair, [...(pairOwners.get(pair) ?? []), item.itemNumber]);
  }

  for (const [pair, itemNumbers] of pairOwners) {
    if (itemNumbers.length > 1) {
      violations.push({ kind: "duplicate_pair", pair, itemNumbers });
    }
  }

  for (const code of PAPI_FACTOR_CODES) {
    if (frequencies[code] !== PAPI_MAX_FACTOR_SCORE) {
      violations.push({
        kind: "factor_frequency",
        factor: code,
        actual: frequencies[code],
        expected: PAPI_MAX_FACTOR_SCORE,
      });
    }
  }

  return { valid: violations.length === 0, violations, frequencies };
}
