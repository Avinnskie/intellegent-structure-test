
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
  { readonly kind: "scored"; readonly score: 0 | 1 | 2 } | { readonly kind: "requires_manual" };

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function normalizeKeyword(keyword: string): string {
  return keyword.toLowerCase().trim();
}

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

  if (!normalized.includes(" ") && !normalized.includes("-")) {
    return responseTokens.includes(normalized);
  }
  return responseJoined.includes(normalized);
}

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
  if (hit(payload.keywords.score0)) {
    return 0;
  }
  return 0;
}

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

function parseExcelNumber(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

class UnexpectedObjectiveRuleError extends Error {
  constructor() {
    super("Jenis aturan skoring objektif tidak dikenali.");
    this.name = "UnexpectedObjectiveRuleError";
  }
}

function assertNever(rule: never): never {
  void rule;
  throw new UnexpectedObjectiveRuleError();
}

export function scoreObjective(
  rule: ObjectiveRule,
  responseValue: string | null,
): ObjectiveOutcome {
  switch (rule.ruleType) {
    case "manual_ge":
      if (!isGeAutoPayload(rule.payload)) {
        return { kind: "requires_manual" };
      }
      if (responseValue === null) {
        return { kind: "scored", score: 0 };
      }
      return { kind: "scored", score: matchGeKeywords(responseValue, rule.payload) };
    case "option_match":
      if (responseValue === null) {
        return { kind: "scored", score: 0 };
      }
      return {
        kind: "scored",
        score: rule.payload.correctOptionCodes.includes(responseValue) ? 1 : 0,
      };
    case "numeric_match": {
      if (responseValue === null) {
        return { kind: "scored", score: 0 };
      }
      const responseNumber = parseExcelNumber(responseValue);
      if (responseNumber === null) {
        return { kind: "scored", score: 0 };
      }
      const isAccepted = rule.payload.acceptedValues.some(
        (acceptedValue) => parseExcelNumber(acceptedValue) === responseNumber,
      );
      return { kind: "scored", score: isAccepted ? 1 : 0 };
    }
    default:
      return assertNever(rule);
  }
}
