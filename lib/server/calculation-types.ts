import { ApiError } from "../api/errors.ts";
import type { SessionStatus } from "../domain/session-state.ts";
import type { SubtestCode } from "../ist-subtests.ts";
import type { AuthContext } from "./authz.ts";

const NOT_FOUND_MESSAGE = "Data tidak ditemukan.";
const TEST_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000;

export const WRONG_STATUS_MESSAGE =
  "Sesi ini belum siap dihitung (harus selesai tes dan dinilai GE).";
export const GE_INCOMPLETE_MESSAGE = "Masih ada jawaban GE yang belum dinilai.";
export const RESULT_FINAL_MESSAGE =
  "Hasil sesi ini sudah final dan tidak dapat dihitung ulang tanpa proses override.";
export const NOT_STARTED_MESSAGE =
  "Sesi ini tidak memiliki waktu mulai; tidak dapat menghitung usia.";

export function testDateIso(startedAt: Date): string {
  return new Date(startedAt.getTime() + TEST_TIMEZONE_OFFSET_MS).toISOString().slice(0, 10);
}

export function calculationNotFound(): ApiError {
  return new ApiError("NOT_FOUND", NOT_FOUND_MESSAGE, 404);
}

export type NeedsReviewReason = "NO_AGE_BAND" | "AMBIGUOUS_AGE_BAND" | `MISSING_NORM_ROW:${string}`;

export type CalculateOutcome =
  | { kind: "calculated"; resultId: string; iqScore: number }
  | { kind: "needs_review"; reason: NeedsReviewReason };

export type CalculationSession = {
  readonly id: string;
  readonly status: SessionStatus;
  readonly startedAt: Date | null;
  readonly formVersionId: string;
  readonly scoringKeyVersionId: string;
  readonly normSetVersionId: string;
  readonly birthDate: string;
};

export type CalculationItem = {
  readonly itemVersionId: string;
  readonly subtestCode: SubtestCode;
  readonly ruleId: string | null;
  readonly ruleType: string | null;
  readonly rulePayload: unknown;
  readonly responseId: string | null;
  readonly storedValue: unknown;
};

export type CalculationActor =
  | { readonly kind: "user"; readonly ctx: AuthContext }
  | { readonly kind: "system"; readonly organizationId: string };

export function actorOrganizationId(actor: CalculationActor): string {
  return actor.kind === "user" ? actor.ctx.organizationId : actor.organizationId;
}

export function actorUserId(actor: CalculationActor): string | null {
  return actor.kind === "user" ? actor.ctx.userId : null;
}
