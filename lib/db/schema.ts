import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["hr_admin", "super_admin"]);
export const recordStatus = pgEnum("record_status", ["active", "inactive"]);
export const accessCodeStatus = pgEnum("access_code_status", [
  "active",
  "in_use",
  "completed",
  "expired",
  "revoked",
  "regenerated",
]);
export const sessionStatus = pgEnum("session_status", [
  "code_generated",
  "code_validated",
  "tutorial",
  "subtest_in_progress",
  "subtest_completed",
  "tutorial_next",
  "test_completed",
  "needs_ge_scoring",
  "calculated",
  "reviewed",
  "final",
  "paused_by_admin",
  "expired",
  "cancelled",
  "invalidated",
  "needs_review",
  "void",
]);
export const attemptStatus = pgEnum("attempt_status", ["in_progress", "completed"]);
export const completionReason = pgEnum("completion_reason", ["manual", "timeout", "admin"]);
export const responseStatus = pgEnum("response_status", [
  "unanswered",
  "answered",
  "skipped",
  "changed",
  "locked",
]);
export const contentStatus = pgEnum("content_status", [
  "draft",
  "in_review",
  "approved",
  "published",
  "rejected",
  "archived",
]);
export const itemType = pgEnum("item_type", ["choice", "short_text", "numeric"]);
export const ruleType = pgEnum("rule_type", ["option_match", "numeric_match", "manual_ge"]);
export const resultStatus = pgEnum("result_status", [
  "waiting_ge",
  "draft",
  "reviewed",
  "final",
  "superseded",
]);
export const actorType = pgEnum("actor_type", ["user", "participant", "system"]);
/**
 * Re-entry policy of a session's access code (HR-configurable at session creation):
 * - `single`: one redemption per code — a closed tab means asking HR to regenerate.
 * - `multi`:  the same code re-admits the participant while the test is still live.
 * Either way, a session that finished testing never re-admits (its code turns `completed`).
 */
export const reentryPolicy = pgEnum("reentry_policy", ["single", "multi"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: recordStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // = Supabase auth user id
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: userRole("role").notNull(),
  permissions: text("permissions").array().notNull().default([]),
  status: recordStatus("status").notNull().default("active"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    externalReference: text("external_reference"),
    fullName: text("full_name").notNull(),
    birthDate: date("birth_date").notNull(),
    gender: text("gender"),
    education: text("education"),
    testPurpose: text("test_purpose").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("candidate_org_ix").on(t.organizationId)],
);

export const assessmentFormVersions = pgTable(
  "assessment_form_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formCode: text("form_code").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    status: contentStatus("status").notNull().default("draft"),
    effectiveDate: date("effective_date"),
    approvedBy: text("approved_by"),
    checksum: text("checksum"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("form_code_version_ux").on(t.formCode, t.version)],
);

export const subtestVersions = pgTable(
  "subtest_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formVersionId: uuid("form_version_id")
      .notNull()
      .references(() => assessmentFormVersions.id),
    code: text("code").notNull(), // SE..ME — fixed order enforced in domain layer
    sequence: integer("sequence").notNull(),
    title: text("title").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    itemCount: integer("item_count").notNull(),
  },
  (t) => [uniqueIndex("subtest_form_code_ux").on(t.formVersionId, t.code)],
);

export const itemVersions = pgTable(
  "item_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subtestVersionId: uuid("subtest_version_id")
      .notNull()
      .references(() => subtestVersions.id),
    itemNumber: integer("item_number").notNull(), // global 1..176
    itemType: itemType("item_type").notNull(),
    prompt: text("prompt").notNull(),
    mediaReference: text("media_reference"),
    placeholder: text("placeholder"),
    sequence: integer("sequence").notNull(),
    status: recordStatus("status").notNull().default("active"),
  },
  (t) => [uniqueIndex("item_subtest_number_ux").on(t.subtestVersionId, t.itemNumber)],
);

export const itemOptions = pgTable(
  "item_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemVersionId: uuid("item_version_id")
      .notNull()
      .references(() => itemVersions.id),
    optionCode: text("option_code").notNull(),
    label: text("label").notNull(),
    sequence: integer("sequence").notNull(),
  },
  (t) => [uniqueIndex("item_option_code_ux").on(t.itemVersionId, t.optionCode)],
);

export const tutorialVersions = pgTable(
  "tutorial_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subtestVersionId: uuid("subtest_version_id")
      .notNull()
      .references(() => subtestVersions.id),
    version: integer("version").notNull(),
    textContent: text("text_content").notNull(),
    videoReference: text("video_reference"),
    status: contentStatus("status").notNull().default("draft"),
    effectiveDate: date("effective_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Identity guarantee for pinned tutorial versions: one row per (subtest, version).
  (t) => [uniqueIndex("tutorial_subtest_version_ux").on(t.subtestVersionId, t.version)],
);

export const scoringKeyVersions = pgTable(
  "scoring_key_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formVersionId: uuid("form_version_id")
      .notNull()
      .references(() => assessmentFormVersions.id),
    version: integer("version").notNull(),
    status: contentStatus("status").notNull().default("draft"),
    effectiveDate: date("effective_date"),
    approvedBy: text("approved_by"),
    checksum: text("checksum"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Identity guarantee for pinned scoring key versions: one row per (form, version).
  (t) => [uniqueIndex("scoring_key_version_ux").on(t.formVersionId, t.version)],
);

export const itemScoringRules = pgTable(
  "item_scoring_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scoringKeyVersionId: uuid("scoring_key_version_id")
      .notNull()
      .references(() => scoringKeyVersions.id),
    itemVersionId: uuid("item_version_id")
      .notNull()
      .references(() => itemVersions.id),
    ruleType: ruleType("rule_type").notNull(),
    rulePayload: jsonb("rule_payload").notNull(), // server-only; never serialized to participants
    maxScore: integer("max_score").notNull(),
  },
  (t) => [uniqueIndex("rule_key_item_ux").on(t.scoringKeyVersionId, t.itemVersionId)],
);

export const normSetVersions = pgTable(
  "norm_set_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formVersionId: uuid("form_version_id")
      .notNull()
      .references(() => assessmentFormVersions.id),
    version: integer("version").notNull(),
    populationReference: text("population_reference"),
    status: contentStatus("status").notNull().default("draft"),
    effectiveDate: date("effective_date"),
    approvedBy: text("approved_by"),
    checksum: text("checksum"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Identity guarantee for pinned norm set versions: one row per (form, version).
  (t) => [uniqueIndex("norm_set_version_ux").on(t.formVersionId, t.version)],
);

export const normAgeBands = pgTable(
  "norm_age_bands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    normSetVersionId: uuid("norm_set_version_id")
      .notNull()
      .references(() => normSetVersions.id),
    label: text("label").notNull(),
    minAge: integer("min_age").notNull(),
    maxAge: integer("max_age").notNull(),
  },
  // An inverted band would silently misgrade candidates — reject it at the database.
  () => [check("norm_band_age_range_ck", sql`min_age <= max_age`)],
);

export const normScoreRows = pgTable(
  "norm_score_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    normAgeBandId: uuid("norm_age_band_id")
      .notNull()
      .references(() => normAgeBands.id),
    subtestCode: text("subtest_code").notNull(),
    rawScore: integer("raw_score").notNull(),
    standardScore: integer("standard_score").notNull(),
  },
  (t) => [uniqueIndex("norm_row_ux").on(t.normAgeBandId, t.subtestCode, t.rawScore)],
);

export const assessmentSessions = pgTable(
  "assessment_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id),
    formVersionId: uuid("form_version_id")
      .notNull()
      .references(() => assessmentFormVersions.id),
    scoringKeyVersionId: uuid("scoring_key_version_id")
      .notNull()
      .references(() => scoringKeyVersions.id),
    normSetVersionId: uuid("norm_set_version_id")
      .notNull()
      .references(() => normSetVersions.id),
    pinnedTutorialVersions: jsonb("pinned_tutorial_versions").notNull(), // { SE: uuid, ... }
    reentryPolicy: reentryPolicy("reentry_policy").notNull().default("single"),
    status: sessionStatus("status").notNull().default("code_generated"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ageAtTest: integer("age_at_test"),
    currentSubtestCode: text("current_subtest_code"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Composite serves the HR dashboard query (sessions of one org filtered by status).
    index("session_org_status_ix").on(t.organizationId, t.status),
    index("session_candidate_ix").on(t.candidateId),
  ],
);

export const accessCodes = pgTable(
  "access_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => assessmentSessions.id),
    codeHash: text("code_hash").notNull().unique(),
    codeMasked: text("code_masked").notNull(), // e.g. IST-7K••••2D — safe for HR list UI
    status: accessCodeStatus("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    regeneratedFromId: uuid("regenerated_from_id").references((): AnyPgColumn => accessCodes.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("access_code_session_ix").on(t.sessionId)],
);

export const participantTokens = pgTable(
  "participant_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => assessmentSessions.id),
    tokenHash: text("token_hash").notNull().unique(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("participant_token_session_ix").on(t.sessionId)],
);

export const subtestAttempts = pgTable(
  "subtest_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => assessmentSessions.id),
    subtestVersionId: uuid("subtest_version_id")
      .notNull()
      .references(() => subtestVersions.id),
    subtestCode: text("subtest_code").notNull(),
    status: attemptStatus("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    durationSeconds: integer("duration_seconds").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completionReason: completionReason("completion_reason"),
  },
  // One attempt ever per (session, subtest) is intentional, not an oversight:
  // spec §11 allows "hanya satu active attempt per subtes per sesi", and a retest is always a
  // NEW session (brief §4.1) — never a reset of an existing attempt. The index doubles as the
  // race safety net that keeps resume idempotent under concurrent requests.
  (t) => [uniqueIndex("attempt_session_subtest_ux").on(t.sessionId, t.subtestCode)],
);

export const responses = pgTable(
  "responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => assessmentSessions.id),
    subtestAttemptId: uuid("subtest_attempt_id")
      .notNull()
      .references(() => subtestAttempts.id),
    itemVersionId: uuid("item_version_id")
      .notNull()
      .references(() => itemVersions.id),
    responseValue: jsonb("response_value"),
    responseStatus: responseStatus("response_status").notNull().default("unanswered"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("response_attempt_item_ux").on(t.subtestAttemptId, t.itemVersionId),
    index("response_session_ix").on(t.sessionId),
  ],
);

export const itemScores = pgTable(
  "item_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => responses.id),
    score: integer("score").notNull(),
    scoringRuleId: uuid("scoring_rule_id").references(() => itemScoringRules.id),
    scoredBy: uuid("scored_by").references(() => users.id), // null = automatic objective scoring
    scoredAt: timestamp("scored_at", { withTimezone: true }).notNull().defaultNow(),
    overrideReason: text("override_reason"),
  },
  (t) => [index("item_score_response_ix").on(t.responseId)],
);

export const assessmentResults = pgTable(
  "assessment_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => assessmentSessions.id),
    status: resultStatus("status").notNull().default("draft"),
    ageAtTest: integer("age_at_test").notNull(),
    normAgeBandId: uuid("norm_age_band_id").references(() => normAgeBands.id),
    totalRawScore: integer("total_raw_score").notNull(),
    totalStandardScore: integer("total_standard_score").notNull(),
    iqScore: integer("iq_score"),
    iqCategory: text("iq_category"),
    dominance: text("dominance"),
    profile: jsonb("profile"),
    formVersionId: uuid("form_version_id")
      .notNull()
      .references(() => assessmentFormVersions.id),
    scoringKeyVersionId: uuid("scoring_key_version_id")
      .notNull()
      .references(() => scoringKeyVersions.id),
    normSetVersionId: uuid("norm_set_version_id")
      .notNull()
      .references(() => normSetVersions.id),
    engineVersion: text("engine_version").notNull(),
    reviewNotes: text("review_notes"),
    supersededById: uuid("superseded_by_id").references((): AnyPgColumn => assessmentResults.id),
    calculatedBy: uuid("calculated_by").references(() => users.id),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedBy: uuid("finalized_by").references(() => users.id),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  },
  (t) => [index("result_session_ix").on(t.sessionId)],
);

export const subtestScores = pgTable(
  "subtest_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resultId: uuid("result_id")
      .notNull()
      .references(() => assessmentResults.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => assessmentSessions.id),
    subtestCode: text("subtest_code").notNull(),
    rawScore: integer("raw_score").notNull(),
    standardScore: integer("standard_score").notNull(),
    category: text("category").notNull(),
    normAgeBandId: uuid("norm_age_band_id")
      .notNull()
      .references(() => normAgeBands.id),
  },
  (t) => [
    uniqueIndex("subtest_score_result_ux").on(t.resultId, t.subtestCode),
    index("subtest_score_session_ix").on(t.sessionId),
  ],
);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  resultId: uuid("result_id")
    .notNull()
    .references(() => assessmentResults.id),
  reportVersion: integer("report_version").notNull(),
  storageReference: text("storage_reference").notNull(),
  fileHash: text("file_hash").notNull(),
  generatedBy: uuid("generated_by")
    .notNull()
    .references(() => users.id),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    actorType: actorType("actor_type").notNull(),
    actorId: text("actor_id"), // user uuid, participant session uuid, or "system"
    action: text("action").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_org_created_ix").on(t.organizationId, t.createdAt)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
});
