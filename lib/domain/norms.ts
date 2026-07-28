
export type AgeBand = {
  readonly id: string;
  readonly label: string;
  readonly minAge: number;
  readonly maxAge: number;
};

export type NormRow = {
  readonly subtestCode: string;
  readonly rawScore: number;
  readonly standardScore: number;
};

export type BandSelection =
  | { readonly kind: "ok"; readonly band: AgeBand }
  | { readonly kind: "needs_review"; readonly reason: "NO_AGE_BAND" | "AMBIGUOUS_AGE_BAND" };

export function selectAgeBand(bands: readonly AgeBand[], age: number): BandSelection {
  const matches = bands.filter((band) => age >= band.minAge && age <= band.maxAge);
  const [band] = matches;
  if (matches.length === 1 && band) {
    return { kind: "ok", band };
  }
  return {
    kind: "needs_review",
    reason: matches.length === 0 ? "NO_AGE_BAND" : "AMBIGUOUS_AGE_BAND",
  };
}

export function lookupStandardScore(
  rows: readonly NormRow[],
  subtestCode: string,
  rawScore: number,
): number | null {
  return (
    rows.find((row) => row.subtestCode === subtestCode && row.rawScore === rawScore)
      ?.standardScore ?? null
  );
}
