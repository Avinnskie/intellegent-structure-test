/**
 * Objective item scoring (spec §14): deterministic 0/1 against the pinned scoring key.
 *
 * Matching is deliberately STRICT for the two truly-objective rule types:
 * - `option_match`: exact option-code equality. No trimming, no case folding — option codes are
 *   machine-generated, so any mismatch is a bug upstream, and fuzziness here would mask it.
 * - `numeric_match`: the response must equal one of the key's EXPLICIT accepted variants after
 *   `trim()`. "12.0" matches only if the key lists "12.0" — normalisation rules belong in the key
 *   (where the psychologist can see and version them), never in the engine.
 *
 * GE (`manual_ge`) has TWO branches — a matter of policy, not accident:
 * - `autoScore: true` + `keywords`: derive 0/1/2 from the response by tokenising and matching
 *   against three ranked keyword lists (score2 / score1 / score0). "Highest match wins" — a
 *   response containing any score2 keyword scores 2 even if it also contains a score1 keyword,
 *   because psychometrically the rubric rewards recognising the more general concept. Anything
 *   OUTSIDE all three lists is a real 0 (spec §14: HR menentukan referensi jawaban; jawaban di
 *   luar rujukan = 0).
 * - `autoScore` false/absent: `requires_manual` — the legacy human path (0/1/2 typed by HR at
 *   `/hr/scoring/[sessionId]/ge`). This exists so that GE items whose keywords have not been
 *   authored yet do not silently score everyone 0.
 *
 * A null response (skipped or never answered) scores 0 — brief §13.
 */

export type GeKeywords = {
  readonly score2: readonly string[];
  readonly score1: readonly string[];
  readonly score0: readonly string[];
};

export type GeMatchMode = "token" | "contains" | "exact";

export type GeAutoPayload = {
  readonly autoScore: true;
  readonly keywords: GeKeywords;
  readonly matchMode?: GeMatchMode;
  readonly rubric?: string;
};

export type GeManualPayload = {
  readonly autoScore?: false;
  readonly rubric?: string;
};

export type ManualGePayload = GeAutoPayload | GeManualPayload | Record<string, unknown>;

export type ObjectiveRule =
  | {
      readonly ruleType: "option_match";
      readonly payload: { readonly correctOptionCodes: readonly string[] };
    }
  | {
      readonly ruleType: "numeric_match";
      readonly payload: { readonly acceptedValues: readonly string[] };
    }
  | { readonly ruleType: "manual_ge"; readonly payload: ManualGePayload };

export type ObjectiveOutcome =
  | { readonly kind: "scored"; readonly score: 0 | 1 | 2 }
  | { readonly kind: "requires_manual" };

/**
 * Split an answer into comparable units. Deliberately liberal: it strips common punctuation and
 * lower-cases, so 'Bunga.', 'bunga,', and 'BUNGA' all resolve to the same token. Hyphens are kept
 * because IST answer keys use them ("tumbuh-tumbuhan").
 */
function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/** Normalise a keyword the same way tokens are normalised, so the comparison stays symmetric. */
function normalizeKeyword(keyword: string): string {
  return keyword.toLowerCase().trim();
}

/**
 * True iff the response contains the keyword under `matchMode`. Token mode is the default: it
 * matches whole words, so 'bunga' matches 'bunga hutan' but not 'bungaan' (avoiding the false
 * positive that plain substring matching produces). Multi-word keywords ("alat indera") are
 * matched as a phrase against the joined token stream.
 */
function matchesKeyword(
  responseTokens: readonly string[],
  responseJoined: string,
  responseRaw: string,
  keyword: string,
  mode: GeMatchMode,
): boolean {
  const normalized = normalizeKeyword(keyword);
  if (normalized.length === 0) {
    return false;
  }

  if (mode === "exact") {
    return responseRaw.trim().toLowerCase() === normalized;
  }
  if (mode === "contains") {
    return responseJoined.includes(normalized);
  }

  // token mode
  if (!normalized.includes(" ") && !normalized.includes("-")) {
    return responseTokens.includes(normalized);
  }
  // Phrase / hyphenated: check as substring on the joined-tokens stream so word boundaries hold.
  return responseJoined.includes(normalized);
}

/**
 * Highest-wins evaluation against three ranked keyword lists. Returns 2, 1, 0. A response outside
 * every list scores 0 — the intentional "di luar rujukan" fallback (spec §14).
 */
export function matchGeKeywords(response: string, payload: GeAutoPayload): 0 | 1 | 2 {
  const tokens = tokenize(response);
  const joined = ` ${tokens.join(" ")} `;
  const mode = payload.matchMode ?? "token";
  const hit = (list: readonly string[]) =>
    list.some((keyword) => matchesKeyword(tokens, joined, response, keyword, mode));

  if (hit(payload.keywords.score2)) {
    return 2;
  }
  if (hit(payload.keywords.score1)) {
    return 1;
  }
  // score0 explicitly matches "clearly wrong" concepts; hitting it OR missing everything both
  // return 0, so the branch exists mostly as documentation and as a hook for future audit.
  if (hit(payload.keywords.score0)) {
    return 0;
  }
  return 0;
}

/** Narrow `manual_ge` payload to the auto-scoring variant, or null if HR has not authored it. */
export function isGeAutoPayload(payload: unknown): payload is GeAutoPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const p = payload as { autoScore?: unknown; keywords?: unknown };
  if (p.autoScore !== true) {
    return false;
  }
  if (!p.keywords || typeof p.keywords !== "object") {
    return false;
  }
  const k = p.keywords as { score2?: unknown; score1?: unknown; score0?: unknown };
  return Array.isArray(k.score2) && Array.isArray(k.score1) && Array.isArray(k.score0);
}

export function scoreObjective(
  rule: ObjectiveRule,
  responseValue: string | null,
): ObjectiveOutcome {
  if (rule.ruleType === "manual_ge") {
    if (!isGeAutoPayload(rule.payload)) {
      return { kind: "requires_manual" };
    }
    if (responseValue === null) {
      return { kind: "scored", score: 0 };
    }
    return { kind: "scored", score: matchGeKeywords(responseValue, rule.payload) };
  }
  if (responseValue === null) {
    return { kind: "scored", score: 0 };
  }
  if (rule.ruleType === "option_match") {
    return {
      kind: "scored",
      score: rule.payload.correctOptionCodes.includes(responseValue) ? 1 : 0,
    };
  }
  return {
    kind: "scored",
    score: rule.payload.acceptedValues.includes(responseValue.trim()) ? 1 : 0,
  };
}
