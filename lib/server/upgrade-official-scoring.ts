import { and, eq, inArray } from "drizzle-orm";
import type { DbLike } from "../db/client.ts";
import {
  assessmentFormVersions,
  assessmentSessions,
  auditLogs,
  itemScoringRules,
  itemVersions,
  normAgeBands,
  normScoreRows,
  normSetVersions,
  scoringKeyVersions,
  subtestVersions,
} from "../db/schema.ts";
import { insertOfficialScoringVersion } from "./seed-scoring.ts";

export const OFFICIAL_SCORING_VERSION = 2;
const DEFAULT_FORM_CODE = "IST-DEFAULT";
export type OfficialScoringUpgradeSummary = {
  readonly created: boolean;
  readonly formVersionId: string;
  readonly scoringKeyVersionId: string;
  readonly normSetVersionId: string;
  readonly ruleCount: number;
  readonly bandCount: number;
  readonly normRowCount: number;
  readonly repinnedSessionCount: number;
};
class OfficialScoringUpgradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficialScoringUpgradeError";
  }
}

async function publishedVersion(db: DbLike, formVersionId: string) {
  const [key] = await db
    .select({ id: scoringKeyVersions.id })
    .from(scoringKeyVersions)
    .where(
      and(
        eq(scoringKeyVersions.formVersionId, formVersionId),
        eq(scoringKeyVersions.version, OFFICIAL_SCORING_VERSION),
      ),
    )
    .limit(1);
  const [norm] = await db
    .select({ id: normSetVersions.id })
    .from(normSetVersions)
    .where(
      and(
        eq(normSetVersions.formVersionId, formVersionId),
        eq(normSetVersions.version, OFFICIAL_SCORING_VERSION),
      ),
    )
    .limit(1);
  if ((key && !norm) || (!key && norm)) {
    throw new OfficialScoringUpgradeError("Versi scoring resmi terpasang sebagian.");
  }
  return key && norm ? { scoringKeyVersionId: key.id, normSetVersionId: norm.id } : null;
}

async function existingCounts(db: DbLike, scoringKeyVersionId: string, normSetVersionId: string) {
  const [rules, bands] = await Promise.all([
    db
      .select({ id: itemScoringRules.id })
      .from(itemScoringRules)
      .where(eq(itemScoringRules.scoringKeyVersionId, scoringKeyVersionId)),
    db
      .select({ id: normAgeBands.id })
      .from(normAgeBands)
      .where(eq(normAgeBands.normSetVersionId, normSetVersionId)),
  ]);
  const scoreRows = bands.length
    ? await db
        .select({ id: normScoreRows.id })
        .from(normScoreRows)
        .where(
          inArray(
            normScoreRows.normAgeBandId,
            bands.map((band) => band.id),
          ),
        )
    : [];
  return {
    ruleCount: rules.length,
    bandCount: bands.length,
    normRowCount: scoreRows.length,
  };
}

async function loadDefaultFormItems(db: DbLike) {
  const [form] = await db
    .select({ id: assessmentFormVersions.id })
    .from(assessmentFormVersions)
    .where(eq(assessmentFormVersions.formCode, DEFAULT_FORM_CODE))
    .limit(1);
  if (!form) {
    throw new OfficialScoringUpgradeError(`Form ${DEFAULT_FORM_CODE} tidak ditemukan.`);
  }
  const itemRows = await db
    .select({ id: itemVersions.id, itemNumber: itemVersions.itemNumber })
    .from(itemVersions)
    .innerJoin(subtestVersions, eq(itemVersions.subtestVersionId, subtestVersions.id))
    .where(eq(subtestVersions.formVersionId, form.id));
  return {
    formVersionId: form.id,
    itemIdByNumber: new Map(itemRows.map((item) => [item.itemNumber, item.id])),
  };
}

type ReleaseIds = {
  readonly scoringKeyVersionId: string;
  readonly normSetVersionId: string;
};

async function repinSessions(
  db: DbLike,
  formVersionId: string,
  release: ReleaseIds,
): Promise<number> {
  const sessions = await db
    .select({
      id: assessmentSessions.id,
      organizationId: assessmentSessions.organizationId,
      scoringKeyVersionId: assessmentSessions.scoringKeyVersionId,
      normSetVersionId: assessmentSessions.normSetVersionId,
    })
    .from(assessmentSessions)
    .where(eq(assessmentSessions.formVersionId, formVersionId));
  const stale = sessions.filter(
    (session) =>
      session.scoringKeyVersionId !== release.scoringKeyVersionId ||
      session.normSetVersionId !== release.normSetVersionId,
  );
  if (stale.length === 0) {
    return 0;
  }
  await db
    .update(assessmentSessions)
    .set({
      scoringKeyVersionId: release.scoringKeyVersionId,
      normSetVersionId: release.normSetVersionId,
    })
    .where(
      inArray(
        assessmentSessions.id,
        stale.map((session) => session.id),
      ),
    );
  await db.insert(auditLogs).values(
    stale.map((session) => ({
      organizationId: session.organizationId,
      actorType: "system" as const,
      action: "scoring.official_upgrade",
      objectType: "assessment_session",
      objectId: session.id,
      metadata: {
        oldScoringKeyVersionId: session.scoringKeyVersionId,
        oldNormSetVersionId: session.normSetVersionId,
        scoringKeyVersionId: release.scoringKeyVersionId,
        normSetVersionId: release.normSetVersionId,
      },
    })),
  );
  return stale.length;
}

async function upgradeWithin(db: DbLike): Promise<OfficialScoringUpgradeSummary> {
  const { formVersionId, itemIdByNumber } = await loadDefaultFormItems(db);
  const installed = await publishedVersion(db, formVersionId);
  const release =
    installed ??
    (await insertOfficialScoringVersion(
      db,
      formVersionId,
      itemIdByNumber,
      OFFICIAL_SCORING_VERSION,
    ));
  const counts =
    "ruleCount" in release
      ? release
      : await existingCounts(db, release.scoringKeyVersionId, release.normSetVersionId);
  const repinnedSessionCount = await repinSessions(db, formVersionId, release);
  return {
    created: installed === null,
    formVersionId,
    scoringKeyVersionId: release.scoringKeyVersionId,
    normSetVersionId: release.normSetVersionId,
    ruleCount: counts.ruleCount,
    bandCount: counts.bandCount,
    normRowCount: counts.normRowCount,
    repinnedSessionCount,
  };
}

export function upgradeOfficialScoring(db: DbLike): Promise<OfficialScoringUpgradeSummary> {
  return db.transaction(upgradeWithin);
}
