/**
 * Norm band selection and standard-score lookup (spec §15).
 *
 * The one rule that must never soften: age matching is EXACT (`min_age <= age <= max_age`). There
 * is no "closest band" — a candidate whose age falls outside every band goes to `needs_review` for
 * a human decision, because a psychological score normed against the wrong population is not an
 * approximation, it is a wrong result (brief §14).
 *
 * Pure functions over plain data: the caller loads the rows, this module only decides.
 */

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

/**
 * Exactly one band must contain the age. Zero → NO_AGE_BAND. More than one means the norm set
 * itself is broken (overlapping bands) — also a human problem, never a silent first-match.
 */
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

/**
 * Exact (subtest, raw) lookup within one band's rows. A missing row returns null — the caller
 * routes that to `needs_review`; inventing a score by interpolation is forbidden for the same
 * reason closest-band is.
 */
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
