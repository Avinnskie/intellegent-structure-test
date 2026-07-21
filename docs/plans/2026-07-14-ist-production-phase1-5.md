# IST Production Development (Phase 1–5) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the mock/in-memory prototype with a production backend: Supabase PostgreSQL via Drizzle, HR auth, server-authoritative session engine, versioned scoring/norm engine (placeholder master data), results, and PDF reports — covering DEVELOPMENT_BRIEF §21 Phases 1–5.

**Architecture:** Modular monolith inside Next.js 16 App Router. Pure domain logic in `lib/domain/` (unit-tested, no I/O), DB-backed services in `lib/server/` (integration-tested against PGlite), thin Route Handlers in `app/api/` matching the API contract in DEVELOPMENT_SPEC §18. Providers (`AuthProvider`, `StorageProvider`) wrap Supabase so the app stays portable to office infrastructure.

**Tech Stack:** Next.js 16.2.10, React 19, TypeScript, Tailwind 4, Drizzle ORM + postgres.js, Supabase (PostgreSQL, Auth email/password, private Storage), Zod, `@react-pdf/renderer`, node:test + PGlite for tests, Playwright for E2E.

**Locked decisions (user-approved 2026-07-14):**
- Scope: Phase 1–5 (foundation → participant engine → HR ops → scoring → results/reports).
- Database: existing **Supabase cloud project** — credentials go in `.env.local` (user provides).
- HR/Admin auth: **Supabase Auth email/password**, server-side session.
- Tenancy: **single-company**; every table keeps `organization_id` so multi-tenant can be enabled later.

**Explicitly deferred (NOT in this plan):**
- Tutorial editor + question-bank draft/review/publish workflows (spec §10/§10A). Master data is seeded versioned; the `/hr/tutorials`, `/hr/question-bank`, `/admin/tutorials`, `/admin/question-bank` pages keep their prototype UI with the existing `PrototypeBadge`.
- Admin user management UI — HR/Super Admin accounts are created via script (`scripts/create-admin-user.ts`).
- Official IST keys/norms/rubric. **All scoring master data is seeded as clearly-labeled `PLACEHOLDER` versions** (brief §28: no production scoring before reconciled keys). The engine, storage, and golden-dataset harness are built so official data slots in as a new version without code changes.
- App-level encryption of `rule_payload` (spec names the column `rule_payload_encrypted`). We store server-only `jsonb`; keys never reach the client. Revisit before go-live.

---

## Context for the implementing engineer

**This is Next.js 16 — APIs differ from training data. Read `node_modules/next/dist/docs/` when unsure.** Known differences that matter here:
- Middleware is renamed **`proxy.ts`** (project root, exports `proxy` function + `config.matcher`).
- `params` in pages/layouts is a **Promise**: `const { sessionId } = await params;`.
- Route Handlers can type context with the global helper: `RouteContext<'/api/sessions/[token]/state'>`; `ctx.params` is a Promise.
- Route Handlers are uncached by default. Never add `force-static` to API routes here.

**Existing code to reuse (read before each task):**
- `lib/ist-subtests.ts` — canonical 9 subtests (codes, item ranges, durations, `questionKind`). This stays the single source for seed data.
- `lib/ist-questions.ts` — 176 deterministic placeholder questions (`IstQuestion` union: choice / short-text / numeric). Seed reads from it.
- `lib/ist-logic.ts` — pure helpers (`calculateExactAge`, `getRemainingSeconds`, code generation/alphabet). Reused/moved into `lib/domain/`.
- `components/participant/*`, `components/hr/*`, `components/ui/*` — the approved baseline UI. Rewire, don't redesign.
- `tests/ist-logic.test.ts` — the existing node:test style to imitate.

**Conventions:**
- Tests: `npm test` runs `node --experimental-strip-types --test "tests/**/*.test.ts"` (Node 25 installed). The glob **must stay quoted** so Node expands it — `sh` has globstar off, so an unquoted `**` collapses to `*` and silently skips tests nested deeper than one directory (fixed 2026-07-15). Unit tests in `tests/unit/`, integration in `tests/integration/`, shared helpers in `tests/helpers/`. Move the two existing test files into `tests/unit/` in T1.
- Imports between local TS files use explicit `.ts` extension (existing style, required by strip-types).
- Commits: conventional (`feat:`, `fix:`, `test:`, `chore:`). No attribution footers (disabled in user settings).
- Immutability, early returns, files <800 lines, no `console.log` in production code (use the logger from T6).
- All UI copy is Indonesian (match existing pages).
- Run `npm run lint` and `npx tsc --noEmit` before each commit.

**Environment (spec §28).** `.env.local` (never committed; `.gitignore` already covers `.env*`):

```
APP_BASE_URL=http://localhost:3000
DATABASE_URL=            # Supabase "Transaction pooler" URI (port 6543)
DIRECT_DATABASE_URL=     # Supabase "Session pooler"/direct URI (port 5432) — drizzle-kit only
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_MEDIA_BUCKET=ist-media
SUPABASE_REPORT_BUCKET=ist-reports
SESSION_TOKEN_SECRET=    # 32+ random bytes, base64
ACCESS_CODE_PEPPER=      # 32+ random bytes, base64
ERROR_MONITORING_DSN=    # optional
```

**STOP-AND-ASK gates:** T5 (cloud migration) and T8 (seed) need real `.env.local` values from the user. If missing, pause and ask — do not fabricate credentials or skip to later tasks that depend on the DB.

---

## Phase 0 — Repo baseline

### Task 1: Baseline commit

**Files:** Modify `.gitignore`; move `tests/ist-logic.test.ts` → `tests/unit/ist-logic.test.ts`, `tests/ist-questions.test.ts` → `tests/unit/ist-questions.test.ts`.

**Step 1:** Append to `.gitignore`:

```
# local evidence/screenshots
.omo/
```

**Step 2:** `mkdir -p tests/unit && git mv` is unavailable (nothing tracked yet) — use plain `mv` for the two test files.

**Step 3:** Run `npm test` → both suites PASS (glob `tests/**/*.test.ts` matches the new location).

**Step 4:** Commit everything as the baseline:

```bash
git add -A
git commit -m "chore: commit baseline UI prototype as regression reference"
```

---

## Phase 1 — Production Foundation (brief §21 Phase 1)

### Task 2: Dependencies + validated config module

**Files:** Modify `package.json`; Create `lib/config.ts`, `.env.example`; Test `tests/unit/config.test.ts`.

**Step 1:** Install:

```bash
npm i drizzle-orm postgres zod @supabase/supabase-js @supabase/ssr
npm i -D drizzle-kit dotenv-cli @electric-sql/pglite
```

**Step 2:** Add npm scripts:

```json
"db:generate": "dotenv -e .env.local -- drizzle-kit generate",
"db:migrate": "dotenv -e .env.local -- drizzle-kit migrate",
"db:seed": "dotenv -e .env.local -- node --experimental-strip-types scripts/seed.ts",
"create-admin": "dotenv -e .env.local -- node --experimental-strip-types scripts/create-admin-user.ts"
```

**Step 3:** Write failing test `tests/unit/config.test.ts`: `getServerConfig()` throws naming the missing var when `DATABASE_URL` is absent; returns typed values when all set (set/restore `process.env` around each case).

**Step 4:** Implement `lib/config.ts`:

```ts
import { z } from "zod";

const serverEnvSchema = z.object({
  APP_BASE_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  SUPABASE_MEDIA_BUCKET: z.string().min(1),
  SUPABASE_REPORT_BUCKET: z.string().min(1),
  SESSION_TOKEN_SECRET: z.string().min(32),
  ACCESS_CODE_PEPPER: z.string().min(32),
  ERROR_MONITORING_DSN: z
    .string()
    .optional()
    .transform((value) => value || undefined),
});

export type ServerConfig = z.infer<typeof serverEnvSchema>;

export function getServerConfig(): ServerConfig {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const invalidPaths = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Konfigurasi environment tidak lengkap/invalid: ${invalidPaths}`);
  }
  return parsed.data;
}
```

No module-level caching (tests mutate env); callers invoke per request — cheap.

**Step 5:** `npm test` → PASS. Create `.env.example` with all keys and empty values plus one-line comments. Commit `feat: add validated server config and production dependencies`.

### Task 3: Drizzle schema + first migration

**Files:** Create `drizzle.config.ts`, `lib/db/schema.ts`, `lib/db/client.ts`; generated `lib/db/migrations/*`.

**Step 1:** `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DIRECT_DATABASE_URL ?? "" },
});
```

**Step 2:** `lib/db/schema.ts` — complete schema (spec §17 + participant tokens + rate limits). Use this verbatim as the starting point:

```ts
import {
  bigserial, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["hr_admin", "super_admin"]);
export const recordStatus = pgEnum("record_status", ["active", "inactive"]);
export const accessCodeStatus = pgEnum("access_code_status", [
  "active", "in_use", "completed", "expired", "revoked", "regenerated",
]);
export const sessionStatus = pgEnum("session_status", [
  "code_generated", "code_validated", "tutorial", "subtest_in_progress", "subtest_completed",
  "tutorial_next", "test_completed", "needs_ge_scoring", "calculated", "reviewed", "final",
  "paused_by_admin", "expired", "cancelled", "invalidated", "needs_review", "void",
]);
export const attemptStatus = pgEnum("attempt_status", ["in_progress", "completed"]);
export const completionReason = pgEnum("completion_reason", ["manual", "timeout", "admin"]);
export const responseStatus = pgEnum("response_status", [
  "unanswered", "answered", "skipped", "changed", "locked",
]);
export const contentStatus = pgEnum("content_status", [
  "draft", "in_review", "approved", "published", "rejected", "archived",
]);
export const itemType = pgEnum("item_type", ["choice", "short_text", "numeric"]);
export const ruleType = pgEnum("rule_type", ["option_match", "numeric_match", "manual_ge"]);
export const resultStatus = pgEnum("result_status", [
  "waiting_ge", "draft", "reviewed", "final", "superseded",
]);
export const actorType = pgEnum("actor_type", ["user", "participant", "system"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: recordStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // = Supabase auth user id
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: userRole("role").notNull(),
  permissions: text("permissions").array().notNull().default([]),
  status: recordStatus("status").notNull().default("active"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const candidates = pgTable("candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  externalReference: text("external_reference"),
  fullName: text("full_name").notNull(),
  birthDate: date("birth_date").notNull(),
  gender: text("gender"),
  education: text("education"),
  testPurpose: text("test_purpose").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assessmentFormVersions = pgTable("assessment_form_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  formCode: text("form_code").notNull(),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  status: contentStatus("status").notNull().default("draft"),
  effectiveDate: date("effective_date"),
  approvedBy: text("approved_by"),
  checksum: text("checksum"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("form_code_version_ux").on(t.formCode, t.version)]);

export const subtestVersions = pgTable("subtest_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  formVersionId: uuid("form_version_id").notNull().references(() => assessmentFormVersions.id),
  code: text("code").notNull(), // SE..ME — fixed order enforced in domain layer
  sequence: integer("sequence").notNull(),
  title: text("title").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  itemCount: integer("item_count").notNull(),
}, (t) => [uniqueIndex("subtest_form_code_ux").on(t.formVersionId, t.code)]);

export const itemVersions = pgTable("item_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  subtestVersionId: uuid("subtest_version_id").notNull().references(() => subtestVersions.id),
  itemNumber: integer("item_number").notNull(), // global 1..176
  itemType: itemType("item_type").notNull(),
  prompt: text("prompt").notNull(),
  mediaReference: text("media_reference"),
  placeholder: text("placeholder"),
  sequence: integer("sequence").notNull(),
  status: recordStatus("status").notNull().default("active"),
}, (t) => [uniqueIndex("item_subtest_number_ux").on(t.subtestVersionId, t.itemNumber)]);

export const itemOptions = pgTable("item_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemVersionId: uuid("item_version_id").notNull().references(() => itemVersions.id),
  optionCode: text("option_code").notNull(),
  label: text("label").notNull(),
  sequence: integer("sequence").notNull(),
}, (t) => [uniqueIndex("item_option_code_ux").on(t.itemVersionId, t.optionCode)]);

export const tutorialVersions = pgTable("tutorial_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  subtestVersionId: uuid("subtest_version_id").notNull().references(() => subtestVersions.id),
  version: integer("version").notNull(),
  textContent: text("text_content").notNull(),
  videoReference: text("video_reference"),
  status: contentStatus("status").notNull().default("draft"),
  effectiveDate: date("effective_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assessmentSessions = pgTable("assessment_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id),
  formVersionId: uuid("form_version_id").notNull().references(() => assessmentFormVersions.id),
  scoringKeyVersionId: uuid("scoring_key_version_id").notNull().references(() => scoringKeyVersions.id),
  normSetVersionId: uuid("norm_set_version_id").notNull().references(() => normSetVersions.id),
  pinnedTutorialVersions: jsonb("pinned_tutorial_versions").notNull(), // { SE: uuid, ... }
  status: sessionStatus("status").notNull().default("code_generated"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ageAtTest: integer("age_at_test"),
  currentSubtestCode: text("current_subtest_code"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("session_status_ix").on(t.status)]);

export const accessCodes = pgTable("access_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => assessmentSessions.id),
  codeHash: text("code_hash").notNull().unique(),
  codeMasked: text("code_masked").notNull(), // e.g. IST-7K••••2D — safe for HR list UI
  status: accessCodeStatus("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  regeneratedFromId: uuid("regenerated_from_id"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const participantTokens = pgTable("participant_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => assessmentSessions.id),
  tokenHash: text("token_hash").notNull().unique(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const subtestAttempts = pgTable("subtest_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => assessmentSessions.id),
  subtestVersionId: uuid("subtest_version_id").notNull().references(() => subtestVersions.id),
  subtestCode: text("subtest_code").notNull(),
  status: attemptStatus("status").notNull().default("in_progress"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  durationSeconds: integer("duration_seconds").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completionReason: completionReason("completion_reason"),
}, (t) => [uniqueIndex("attempt_session_subtest_ux").on(t.sessionId, t.subtestCode)]);

export const responses = pgTable("responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => assessmentSessions.id),
  subtestAttemptId: uuid("subtest_attempt_id").notNull().references(() => subtestAttempts.id),
  itemVersionId: uuid("item_version_id").notNull().references(() => itemVersions.id),
  responseValue: jsonb("response_value"),
  responseStatus: responseStatus("response_status").notNull().default("unanswered"),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
}, (t) => [uniqueIndex("response_attempt_item_ux").on(t.subtestAttemptId, t.itemVersionId)]);

export const scoringKeyVersions = pgTable("scoring_key_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  formVersionId: uuid("form_version_id").notNull().references(() => assessmentFormVersions.id),
  version: integer("version").notNull(),
  status: contentStatus("status").notNull().default("draft"),
  effectiveDate: date("effective_date"),
  approvedBy: text("approved_by"),
  checksum: text("checksum"),
});

export const itemScoringRules = pgTable("item_scoring_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  scoringKeyVersionId: uuid("scoring_key_version_id").notNull().references(() => scoringKeyVersions.id),
  itemVersionId: uuid("item_version_id").notNull().references(() => itemVersions.id),
  ruleType: ruleType("rule_type").notNull(),
  rulePayload: jsonb("rule_payload").notNull(), // server-only; never serialized to participants
  maxScore: integer("max_score").notNull(),
}, (t) => [uniqueIndex("rule_key_item_ux").on(t.scoringKeyVersionId, t.itemVersionId)]);

export const normSetVersions = pgTable("norm_set_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  formVersionId: uuid("form_version_id").notNull().references(() => assessmentFormVersions.id),
  version: integer("version").notNull(),
  populationReference: text("population_reference"),
  status: contentStatus("status").notNull().default("draft"),
  effectiveDate: date("effective_date"),
  approvedBy: text("approved_by"),
  checksum: text("checksum"),
});

export const normAgeBands = pgTable("norm_age_bands", {
  id: uuid("id").primaryKey().defaultRandom(),
  normSetVersionId: uuid("norm_set_version_id").notNull().references(() => normSetVersions.id),
  label: text("label").notNull(),
  minAge: integer("min_age").notNull(),
  maxAge: integer("max_age").notNull(),
});

export const normScoreRows = pgTable("norm_score_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  normAgeBandId: uuid("norm_age_band_id").notNull().references(() => normAgeBands.id),
  subtestCode: text("subtest_code").notNull(),
  rawScore: integer("raw_score").notNull(),
  standardScore: integer("standard_score").notNull(),
}, (t) => [uniqueIndex("norm_row_ux").on(t.normAgeBandId, t.subtestCode, t.rawScore)]);

export const itemScores = pgTable("item_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  responseId: uuid("response_id").notNull().references(() => responses.id),
  score: integer("score").notNull(),
  scoringRuleId: uuid("scoring_rule_id").references(() => itemScoringRules.id),
  scoredBy: uuid("scored_by").references(() => users.id), // null = automatic objective scoring
  scoredAt: timestamp("scored_at", { withTimezone: true }).notNull().defaultNow(),
  overrideReason: text("override_reason"),
}, (t) => [index("item_score_response_ix").on(t.responseId)]);

export const assessmentResults = pgTable("assessment_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => assessmentSessions.id),
  status: resultStatus("status").notNull().default("draft"),
  ageAtTest: integer("age_at_test").notNull(),
  normAgeBandId: uuid("norm_age_band_id").references(() => normAgeBands.id),
  totalRawScore: integer("total_raw_score").notNull(),
  totalStandardScore: integer("total_standard_score").notNull(),
  iqScore: integer("iq_score"),
  iqCategory: text("iq_category"),
  dominance: text("dominance"),
  profile: jsonb("profile"),
  formVersionId: uuid("form_version_id").notNull().references(() => assessmentFormVersions.id),
  scoringKeyVersionId: uuid("scoring_key_version_id").notNull().references(() => scoringKeyVersions.id),
  normSetVersionId: uuid("norm_set_version_id").notNull().references(() => normSetVersions.id),
  engineVersion: text("engine_version").notNull(),
  reviewNotes: text("review_notes"),
  supersededById: uuid("superseded_by_id"),
  calculatedBy: uuid("calculated_by").notNull().references(() => users.id),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
  finalizedBy: uuid("finalized_by").references(() => users.id),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
});

export const subtestScores = pgTable("subtest_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  resultId: uuid("result_id").notNull().references(() => assessmentResults.id),
  sessionId: uuid("session_id").notNull().references(() => assessmentSessions.id),
  subtestCode: text("subtest_code").notNull(),
  rawScore: integer("raw_score").notNull(),
  standardScore: integer("standard_score").notNull(),
  category: text("category").notNull(),
  normAgeBandId: uuid("norm_age_band_id").notNull().references(() => normAgeBands.id),
}, (t) => [uniqueIndex("subtest_score_result_ux").on(t.resultId, t.subtestCode)]);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  resultId: uuid("result_id").notNull().references(() => assessmentResults.id),
  reportVersion: integer("report_version").notNull(),
  storageReference: text("storage_reference").notNull(),
  fileHash: text("file_hash").notNull(),
  generatedBy: uuid("generated_by").notNull().references(() => users.id),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  actorType: actorType("actor_type").notNull(),
  actorId: text("actor_id"), // user uuid, participant session uuid, or "system"
  action: text("action").notNull(),
  objectType: text("object_type").notNull(),
  objectId: text("object_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_org_created_ix").on(t.organizationId, t.createdAt)]);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Note: `assessmentSessions` references `scoringKeyVersions`/`normSetVersions` defined later in the file — hoisting is fine in Drizzle because references are lazy callbacks, but TypeScript needs the tables declared before use in value position; **order the declarations so master-data tables come before `assessmentSessions`** (adjust order when writing the real file).

**Step 3:** `lib/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";
import { getServerConfig } from "../config.ts";

// prepare:false — required for the Supabase transaction pooler (pgbouncer).
let cached: ReturnType<typeof createDb> | null = null;

function createDb() {
  const client = postgres(getServerConfig().DATABASE_URL, { prepare: false });
  return drizzle(client, { schema });
}

export function getDb() {
  cached ??= createDb();
  return cached;
}

export type Db = ReturnType<typeof getDb>;
// Services accept a `DbLike` so PGlite test databases can be injected.
export type DbLike = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
```

(If the `DbLike` transaction-parameter extraction fights the compiler, fall back to `PgDatabase<any, typeof schema>` from `drizzle-orm/pg-core` — services only need query + transaction methods.)

**Step 4:** Generate the migration: `npm run db:generate` (env only needs `DIRECT_DATABASE_URL` set to anything non-empty for generate). Inspect `lib/db/migrations/0000_*.sql` — verify all 23 tables and enums appear.

**Step 5:** `npx tsc --noEmit` → clean. Commit `feat: add drizzle schema, client, and initial migration`.

> **Hardening applied after code review (2026-07-15) — `lib/db/schema.ts` is authoritative, this listing is not.** Added: 8 hot-path indexes on FK columns (`candidate_org_ix`, `session_candidate_ix`, `access_code_session_ix`, `participant_token_session_ix`, `response_session_ix`, `result_session_ix`, `subtest_score_session_ix`, and `session_org_status_ix` replacing the status-only index); unique `(parent, version)` on `scoring_key_versions`, `norm_set_versions`, `tutorial_versions`; self-referencing FKs for `regenerated_from_id`/`superseded_by_id` lineage; `created_at` on the two scoring/norm version tables; `$onUpdate` on `responses.updated_at`; CHECK `min_age <= max_age` on `norm_age_bands`. `client.ts` uses a `globalThis` pool stash with `max`/`idle_timeout`/`connect_timeout` (dev hot-reload leaked pools otherwise). `drizzle.config.ts` fails fast on missing `DIRECT_DATABASE_URL` only for commands that actually connect (`migrate`/`push`/`pull`/`studio`), so `generate` still works without `.env.local`. Decision recorded: `attempt_session_subtest_ux` is intentionally one-attempt-ever per (session, subtest) — a retest is always a new session (spec §11, brief §4.1).

### Task 4: PGlite test harness

**Files:** Create `tests/helpers/test-db.ts`; Test `tests/integration/schema.test.ts`.

**Step 1:** `tests/helpers/test-db.ts`:

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../lib/db/schema.ts";

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./lib/db/migrations" });
  return { db, close: () => client.close() };
}
export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];
```

**Step 2:** Write `tests/integration/schema.test.ts`: create test db → insert an organization → insert a user referencing it → select back → assert. Also assert inserting `users` with bad `organization_id` rejects (FK).

**Step 3:** `npm test` → PASS (PGlite runs in-process; no Docker). Commit `test: add pglite integration harness`.

> **Adjusted during implementation (2026-07-15).** The harness resolves `migrationsFolder` from `import.meta.url` instead of the CWD-relative `"./lib/db/migrations"`. This task also proved the plan's `DbLike` concern real: the postgres-js-derived union rejected the PGlite database, so `lib/db/client.ts` now uses the driver-agnostic `PgDatabase<PgQueryResultHKT, typeof schema>` (better than the plan's `PgDatabase<any, …>` fallback — no `any`, still schema-bound). Verified by type probe: it accepts the pool, a transaction handle, and `TestDb`. Note PGlite boot + migration replay costs ~3s per `createTestDb()`; if suites later slow down, dump/restore the data dir instead of re-migrating (matters most for Tasks 18 and 28).

### Task 5: Apply migration to Supabase cloud — STOP-AND-ASK gate

**Step 1:** Confirm `.env.local` exists with real `DIRECT_DATABASE_URL`/`DATABASE_URL`. **If not, stop and ask the user to fill `.env.local` from `.env.example` (Supabase Dashboard → Connect → ORMs).**

**Step 2:** `npm run db:migrate` → applies `0000_*`.

**Step 3:** Verify: `dotenv -e .env.local -- node --experimental-strip-types -e "…select 1 from organizations…"` or a tiny `scripts/db-check.ts` that lists table names via `information_schema`. Expected: all 23 tables.

**Step 4:** Commit `chore: record applied baseline migration` (if any files changed; the migration itself was committed in T3).

### Task 6: API plumbing — error envelope, logger, audit service

**Files:** Create `lib/api/errors.ts`, `lib/server/logger.ts`, `lib/server/audit.ts`; Tests `tests/unit/errors.test.ts`, `tests/integration/audit.test.ts`.

**Step 1:** Failing tests first:
- `errors.test.ts`: `toErrorResponse(new ApiError("SESSION_EXPIRED", "Sesi tidak lagi aktif.", 410))` → `{ error: { code, message, requestId } }` with status 410; unknown `Error` maps to `INTERNAL_ERROR`/500 without leaking `message`.
- `audit.test.ts` (PGlite): `writeAudit(db, {...})` inserts a row; metadata round-trips.

**Step 2:** Implement `lib/api/errors.ts`:

```ts
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function toErrorResponse(error: unknown, requestId: string): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message, requestId } },
      { status: error.status },
    );
  }
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan pada server.", requestId } },
    { status: 500 },
  );
}

export function withApiHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>,
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    const requestId = crypto.randomUUID();
    try {
      return await handler(...args);
    } catch (error) {
      const { logError } = await import("../server/logger.ts");
      logError("api_error", { requestId }, error);
      return toErrorResponse(error, requestId);
    }
  };
}
```

`lib/server/logger.ts`: structured JSON logger (`logInfo`, `logError`) writing to stdout/stderr; **must never receive PII, full codes, tokens, answers, or keys** — enforce by only logging explicit fields, never whole objects from request bodies.

`lib/server/audit.ts`: `writeAudit(db, { organizationId, actorType, actorId, action, objectType, objectId, metadata })` — single insert into `auditLogs`. No update/delete helpers exist anywhere (append-only by construction).

**Step 3:** `npm test` → PASS. Commit `feat: add api error envelope, structured logger, audit service`.

### Task 7: HR/Admin authentication (Supabase Auth) + authorization

**Files:** Create `lib/providers/supabase-server.ts`, `lib/server/authz.ts`, `proxy.ts`, `app/login/page.tsx`, `app/login/actions.ts`, `scripts/create-admin-user.ts`; Modify `app/hr/layout.tsx`, `app/admin/layout.tsx`; Test `tests/integration/authz.test.ts`.

**Step 1:** `lib/providers/supabase-server.ts` (the `AuthProvider` seam):

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerConfig } from "../config.ts";

export async function createSupabaseServerClient() {
  const config = getServerConfig();
  const cookieStore = await cookies();
  return createServerClient(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        },
      },
    },
  );
}
```

**Step 2:** `lib/server/authz.ts`:
- `getAuthUser()` → supabase `auth.getUser()`; null when anonymous.
- `requireHrUser(db)` → auth user + `users` row; throws `ApiError("UNAUTHENTICATED", …, 401)` / `ApiError("FORBIDDEN", …, 403)` when missing/inactive. Returns `{ userId, organizationId, role, permissions }`.
- `requirePermission(ctx, permission)` → super_admin does NOT bypass `view_results` (spec §4.3) — permission array is checked literally for everyone; `hr_admin` role implies `view_results` within own org.
- `assertSameOrigin(request)` → for mutation handlers: compare `Origin` header host against `APP_BASE_URL` host; throw 403 `CSRF_REJECTED` on mismatch. (Cookie-session CSRF defense, spec §19.)

Integration test (PGlite): `requirePermission` allows/denies matrix for hr_admin vs super_admin with/without `view_results`.

**Step 3:** `proxy.ts` (root) — optimistic redirect only (real enforcement is `requireHrUser` in layouts/handlers):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return response;
}

export const config = { matcher: ["/hr/:path*", "/admin/:path*"] };
```

**Step 4:** `app/login/page.tsx` + `app/login/actions.ts` (server action: `signInWithPassword`, on success `redirect(next ?? "/hr")`; on failure return an Indonesian error message). Style with existing `app-shell`/portal patterns — single card, no dashboard chrome. Add a logout server action surfaced in `components/ui/portal-shell.tsx`.

**Step 5:** Harden `app/hr/layout.tsx` and `app/admin/layout.tsx`: make them async server components that call `requireHrUser` (admin layout additionally requires role `super_admin`) and redirect to `/login` on failure.

**Step 6:** `scripts/create-admin-user.ts`: uses `SUPABASE_SECRET_KEY` + `supabase.auth.admin.createUser({ email, password, email_confirm: true })`, then inserts the matching `users` row (args: email, password, display name, role, permissions). Idempotent on email.

**Step 7:** `npm test`, `npx tsc --noEmit`, then manual check: `npm run dev`, hit `/hr` → redirected to `/login`; after creating a user with the script, login succeeds. Commit `feat: add supabase auth, proxy guard, and server-side authorization`.

### Task 8: Seed script (versioned placeholder master data) — STOP-AND-ASK gate

**Files:** Create `scripts/seed.ts`, `scripts/setup-storage.ts`, `lib/domain/placeholder-key.ts`; Test `tests/unit/placeholder-key.test.ts`.

**Step 1:** `lib/domain/placeholder-key.ts` — deterministic placeholder answer rules derived from `lib/ist-questions.ts` (single source for seed AND golden fixtures):

```ts
import type { IstQuestion } from "../ist-questions.ts";

export const ENGINE_VERSION = "0.1.0-placeholder";

export function placeholderRuleFor(question: IstQuestion):
  | { ruleType: "option_match"; payload: { correctOptionCodes: string[] }; maxScore: 1 }
  | { ruleType: "numeric_match"; payload: { acceptedValues: string[] }; maxScore: 1 }
  | { ruleType: "manual_ge"; payload: { rubric: string }; maxScore: 2 } {
  if (question.kind === "choice") {
    const codes = ["a", "b", "c", "d", "e"] as const;
    return {
      ruleType: "option_match",
      payload: { correctOptionCodes: [codes[question.globalNumber % 5]] },
      maxScore: 1,
    };
  }
  if (question.kind === "numeric") {
    const value = String(question.globalNumber * 2);
    return { ruleType: "numeric_match", payload: { acceptedValues: [value, `${value}.0`] }, maxScore: 1 };
  }
  return {
    ruleType: "manual_ge",
    payload: { rubric: "PLACEHOLDER: 0 = salah, 1 = sebagian, 2 = tepat" },
    maxScore: 2,
  };
}
```

Unit test: SE item 3 → option `d`; RA item 80 → `["160","160.0"]`; GE → manual_ge maxScore 2.

**Step 2:** `scripts/seed.ts` — idempotent (skip when `form_code='IST-PLACEHOLDER'` exists). Inserts:
1. Organization `"PT Placeholder"` (or from `SEED_ORG_NAME` env).
2. `assessment_form_versions`: `form_code="IST-PLACEHOLDER"`, version 1, status `published`, title `"IST Placeholder Form (BUKAN materi resmi)"`.
3. 9 `subtest_versions` from `lib/ist-subtests.ts` (sequence, durations ×60).
4. 176 `item_versions` + `item_options` from `buildQuestions()`/exported questions in `lib/ist-questions.ts` (map `kind`: choice→`choice`, short-text→`short_text`, numeric→`numeric`; keep `placeholder` text).
5. One published `tutorial_versions` per subtest (textContent from `tutorialSummary` + `examplePrompt`; videoReference null).
6. `scoring_key_versions` v1 `published` + 176 `item_scoring_rules` via `placeholderRuleFor`.
7. `norm_set_versions` v1 `published`, `population_reference="PLACEBO — bukan norma resmi"`; 8 `norm_age_bands` (15–19, 20–24, 25–29, 30–34, 35–39, 40–44, 45–49, 50–60); `norm_score_rows` for every band × 9 subtests × raw 0..itemCount with `standardScore = 80 + raw * 2 + bandIndex` (band-dependent on purpose, so age-band tests are meaningful).

**Step 3:** `scripts/setup-storage.ts`: create private buckets `SUPABASE_MEDIA_BUCKET`, `SUPABASE_REPORT_BUCKET` via secret-key client (`createBucket(..., { public: false })`), idempotent.

**Step 4:** Run against PGlite first: temporarily point seed at test harness in `tests/integration/seed.test.ts` — export `runSeed(db)` from a `lib/server/seed-core.ts` so both the script and the test share it. Assert: 176 items, 176 rules, 8 bands, row counts.

**Step 5:** Run `npm run db:seed` and `dotenv -e .env.local -- node --experimental-strip-types scripts/setup-storage.ts` against cloud (**ask user if creds missing**). Then `npm run create-admin -- --email ... --role super_admin` for the first account (ask the user for the email they want).

**Step 6:** Commit `feat: add idempotent seed with placeholder versioned master data`.

**Phase 1 exit check (brief §21):** migrations reproducible (`db:migrate` idempotent), auth + RBAC live, audit trail writable, CI-equivalent local pipeline green (`lint`, `tsc`, `test`, `build`).

---

## Phase 2 — Participant Session Engine (brief §21 Phase 2)

### Task 9: Pure domain — access codes & participant tokens

**Files:** Create `lib/domain/access-code.ts`, `lib/domain/session-token.ts`, `lib/domain/age.ts`, `lib/domain/timer.ts`; Modify `lib/ist-logic.ts` (re-export from new modules to keep prototype pages compiling until T16/T17); Tests `tests/unit/access-code.test.ts`, `tests/unit/session-token.test.ts`.

**Step 1:** Failing tests:
- `generateAccessCode` format `IST-` + 8 chars from unambiguous alphabet (move existing impl but with `crypto.randomInt`, not `Math.random`).
- `hashAccessCode("IST-AAAA2222", pepper)` deterministic hex, differs per pepper; `maskAccessCode` → `IST-AA••••22`.
- `generateSessionToken()` → 43-char base64url, unique across 100 calls; `hashSessionToken(token, secret)` deterministic.

**Step 2:** Implement with node:crypto:

```ts
import { createHmac, randomInt, randomBytes } from "node:crypto";

export const ACCESS_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

export function generateAccessCode(): string {
  const body = Array.from(
    { length: CODE_LENGTH },
    () => ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)],
  ).join("");
  return `IST-${body}`;
}

export function normalizeAccessCode(input: string): string {
  return input.trim().toUpperCase();
}

export function hashAccessCode(code: string, pepper: string): string {
  return createHmac("sha256", pepper).update(normalizeAccessCode(code)).digest("hex");
}

export function maskAccessCode(code: string): string {
  const body = code.replace(/^IST-/, "");
  return `IST-${body.slice(0, 2)}••••${body.slice(-2)}`;
}
```

`session-token.ts`: `generateSessionToken` = `randomBytes(32).toString("base64url")`; `hashSessionToken` = HMAC-SHA256 with `SESSION_TOKEN_SECRET`.

`age.ts`: move `calculateExactAge` verbatim from `ist-logic.ts` + tests for birthday boundaries (same day → counted, day before → not).
`timer.ts`: move `getRemainingSeconds`/`getDisplayRemainingSeconds`.

**Step 3:** `npm test` → PASS. Commit `feat: add access-code and session-token domain modules`.

### Task 10: Pure domain — session state machine

**Files:** Create `lib/domain/session-state.ts`; Test `tests/unit/session-state.test.ts`.

**Step 1:** Failing tests: every legal edge of spec §13 passes `assertSessionTransition`; illegal ones (`final→tutorial`, `code_generated→subtest_in_progress`) throw; exception states reachable from any non-terminal state.

**Step 2:** Implement:

```ts
export type SessionStatus =
  | "code_generated" | "code_validated" | "tutorial" | "subtest_in_progress"
  | "subtest_completed" | "tutorial_next" | "test_completed" | "needs_ge_scoring"
  | "calculated" | "reviewed" | "final"
  | "paused_by_admin" | "expired" | "cancelled" | "invalidated" | "needs_review" | "void";

const EXCEPTIONS: readonly SessionStatus[] = [
  "paused_by_admin", "expired", "cancelled", "invalidated", "needs_review", "void",
];
const TERMINAL: readonly SessionStatus[] = ["final", "cancelled", "invalidated", "void", "expired"];

const FLOW: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = {
  code_generated: ["code_validated"],
  code_validated: ["tutorial"],
  tutorial: ["subtest_in_progress"],
  subtest_in_progress: ["subtest_completed"],
  subtest_completed: ["tutorial_next", "test_completed"],
  tutorial_next: ["subtest_in_progress"],
  test_completed: ["needs_ge_scoring"],
  needs_ge_scoring: ["calculated"],
  calculated: ["reviewed", "final", "needs_ge_scoring"], // re-score path returns to needs_ge_scoring? no — recalculation stays at calculated; keep ["reviewed","final"]
  reviewed: ["final"],
  final: [],
  paused_by_admin: ["tutorial", "tutorial_next", "subtest_in_progress", "cancelled", "void"],
  expired: [], cancelled: [], invalidated: [], needs_review: ["calculated", "invalidated"],
  void: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  if (TERMINAL.includes(from)) return false;
  if (EXCEPTIONS.includes(to) && to !== "needs_review") return true; // admin/system exception paths
  return FLOW[from].includes(to) || (to === "needs_review" && from === "calculated");
}

export class InvalidTransitionError extends Error {
  constructor(readonly from: SessionStatus, readonly to: SessionStatus) {
    super(`Transisi status sesi tidak valid: ${from} -> ${to}`);
  }
}

export function assertSessionTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
```

(Resolve the `calculated` targets while writing tests: `calculated → reviewed | final | needs_review`; recalculation creates a new result row and leaves session at `calculated`.)

**Step 3:** Also export `SUBTEST_ORDER` (re-export `SUBTEST_CODES` from `ist-subtests.ts`) and `nextSubtestCode(code): code | null`. Test both. Commit `feat: add session state machine domain module`.

> **Resolved during implementation (2026-07-15) — `lib/domain/session-state.ts` is authoritative.** `calculated → reviewed | final | needs_review`; recalculation does NOT move the session (Task 27 writes a new result row and leaves it at `calculated`), so `needs_ge_scoring` was removed from `calculated`'s targets and the special-case clause in `canTransition` was deleted. `needs_review` is reachable from BOTH `needs_ge_scoring` and `calculated`: the first calculation runs from `needs_ge_scoring`, and a no-age-band outcome creates no result row (spec §15) — it stays out of the admin fast-path either way. Self-transitions (`from === to`) are rejected. The snippet above uses constructor parameter properties, which **Node's `--experimental-strip-types` rejects at runtime** — declare fields explicitly (same trap as Task 6).

### Task 11: Access-code validation service + endpoint + rate limiting

**Files:** Create `lib/server/rate-limit.ts`, `lib/server/participant-access.ts`, `app/api/access-codes/validate/route.ts`; Tests `tests/integration/participant-access.test.ts`.

**Step 1:** Failing integration tests (PGlite; build fixtures with a `tests/helpers/fixtures.ts` that inserts org/user/candidate/session/access code — write that helper here, reuse everywhere):
- valid active code → returns `{ sessionToken, sessionStatus: "code_validated", nextRoute: "/test/<token>/tutorial/SE" }`; code flips to `in_use`; `participant_tokens` row exists; session status `tutorial` (validated then moved to tutorial atomically); audit rows written.
- second validate on same code → returns the SAME session but a NEW token is NOT issued if an unexpired token exists — instead `CODE_IN_USE` error (`one code cannot create two active attempts`, brief §8). (Resume happens via the token URL, not by re-entering the code; document this in the error message: "Kode sedang digunakan. Lanjutkan dari tab/perangkat sebelumnya atau hubungi HR.")
- expired (`expires_at` past) → `CODE_EXPIRED`, status persisted to `expired`.
- revoked/regenerated/completed → matching error codes, no token.
- unknown code → `CODE_INVALID`; rate-limit counter increments; 11th attempt from same key → `RATE_LIMITED` (429) even with a valid code.

**Step 2:** `lib/server/rate-limit.ts` — atomic window counter (single SQL statement, works on PGlite and Postgres):

```ts
import { sql } from "drizzle-orm";

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 10;

export async function consumeRateLimit(db: DbLike, key: string): Promise<boolean> {
  const rows = await db.execute(sql`
    insert into rate_limits (key, count, window_started_at)
    values (${key}, 1, now())
    on conflict (key) do update set
      count = case
        when rate_limits.window_started_at < now() - interval '15 minutes' then 1
        else rate_limits.count + 1
      end,
      window_started_at = case
        when rate_limits.window_started_at < now() - interval '15 minutes' then now()
        else rate_limits.window_started_at
      end
    returning count
  `);
  return Number(rows[0]?.count ?? 0) <= MAX_ATTEMPTS;
}
```

**Step 3:** `lib/server/participant-access.ts` `validateAccessCode(db, { code, clientKey })`:
1. `consumeRateLimit(db, \`code:${clientKey}\`)` → else `ApiError("RATE_LIMITED", …, 429)`.
2. Hash code, look up `access_codes` by `code_hash` (constant-time by design: hash lookup, no early length branch).
3. Map non-active statuses to `CODE_*` errors; lazily persist `expired` when `expires_at < now`.
4. In a transaction: assert session status is `code_generated` (or token expired path), transition `code_generated → code_validated → tutorial` via `assertSessionTransition`, set `current_subtest_code = "SE"`, code → `in_use` + `last_used_at`, insert `participant_tokens` (hash only), write audit (`action: "access_code.validated"`, actorType `participant`, actorId session id — never the code).
5. Return plaintext token (only time it exists server-side).

**Step 4:** Route handler `app/api/access-codes/validate/route.ts`:

```ts
import { z } from "zod";
import { withApiHandler } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { validateAccessCode } from "@/lib/server/participant-access.ts";

const bodySchema = z.object({ code: z.string().min(4).max(20) });

export const POST = withApiHandler(async (request: Request) => {
  const body = bodySchema.parse(await request.json());
  const clientKey =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const result = await validateAccessCode(getDb(), { code: body.code, clientKey });
  return Response.json(result);
});
```

(Zod errors: extend `withApiHandler` to map `ZodError` → 422 `VALIDATION_ERROR` — add that mapping + unit test now.)

**Step 5:** `npm test` → PASS. Commit `feat: add access-code validation with rate limiting and participant tokens`.

**Amendments made during T11 implementation (both are binding for later tasks):**

1. **Response contract changed:** `sessionStatus` is the session's LIVE persisted status, so a successful validate returns `"tutorial"` — NOT `"code_validated"` as Step 1 and `DEVELOPMENT_SPEC.md` §18 originally showed. The row is already at `tutorial` when the response is built (both hops commit in one transaction), so returning `code_validated` was a field that contradicted the row it names. The service reads the status back via `RETURNING` from the `UPDATE` and types it as `SessionStatus`; `tests/integration/participant-access.test.ts` pins the returned value against the row read back from the DB. Spec §18 updated to match.
2. **The Step 2 rate-limit snippet is superseded — do not reintroduce it.** Raw `db.execute` with a tagged SQL template returns a bare array on postgres-js but a `{ rows }` object on PGlite, so `rows[0]?.count` reads `undefined` under PGlite → `Number(undefined ?? 0) <= 10` → **true forever: the limiter is silently disabled in every test while looking correct.** `lib/server/rate-limit.ts` uses drizzle's insert / `onConflictDoUpdate` / `.returning()` instead, which normalizes both drivers onto one typed shape, plus `make_interval(mins => ...)` so `WINDOW_MINUTES` has a single definition. Same single atomic statement; verified on PGlite AND on real Supabase Postgres (transaction pooler, `prepare:false`). Any future limiter (login, HR endpoints) should reuse `consumeRateLimit` / `rateLimitKey` rather than re-deriving raw SQL.

### Task 12: Session state service + GET state + heartbeat

**Files:** Create `lib/server/participant-session.ts`, `app/api/sessions/[token]/state/route.ts`, `app/api/sessions/[token]/heartbeat/route.ts`; Test `tests/integration/participant-session.test.ts`.

**Step 1:** Failing tests:
- `resolveParticipantSession(db, token)` → session context; unknown/revoked token → `TOKEN_INVALID` 401.
- `getSessionState` in `tutorial` → `{ sessionStatus, currentSubtest: { code, title, itemCount, durationSeconds }, tutorial: { textContent, videoReference }, serverNow, nextRoute }` — tutorial content comes from the session's `pinnedTutorialVersions`, not the latest published (create a second tutorial version in the fixture and assert the pinned one wins).
- with an in-progress attempt → includes `attempt: { startedAt, expiresAt, remainingSeconds }` and per-item statuses `{ itemNumber, status }` (никаких answers/keys — assert response omits `responseValue` of other items and any `rulePayload`).
- **timeout sweep:** attempt with `expires_at` in the past → `getSessionState` atomically closes it (`completed`/`timeout`, responses locked, session → `subtest_completed` → `tutorial_next` with next code, or `test_completed→needs_ge_scoring` after ME) and returns the next-tutorial state. Calling twice is idempotent ("timeout menutup subtes satu kali").

**Step 2:** Implement `lib/server/participant-session.ts`:
- `resolveParticipantSession(db, rawToken)` — hash, join `participant_tokens → assessment_sessions`, update `last_seen_at`.
- `sweepExpiredAttempt(tx, session)` — shared closing logic (also used by T14/T15): `update subtest_attempts set status='completed', completion_reason='timeout', completed_at=now() where id=… and status='in_progress'` (idempotence via `where status='in_progress'` + row-count check), lock responses (`response_status='locked'` stays as-is for answered/skipped — set `locked_at`), advance session via `assertSessionTransition` chain, write audit `subtest.timeout`.
- `getSessionState(db, token)` — transaction: resolve → sweep → assemble DTO. `nextRoute` computed from status: `tutorial|tutorial_next → /test/{token}/tutorial/{code}`, `subtest_in_progress → /test/{token}/question/{code}/{firstUnansweredLocalNumber}`, `test_completed|needs_ge_scoring|… → /test/{token}/complete`.
- Heartbeat: `POST` → same sweep, returns `{ serverNow, sessionStatus, remainingSeconds }`.

**Step 3:** Route handlers with `RouteContext<'/api/sessions/[token]/state'>`; token from `await ctx.params`. `npm test` → PASS. Commit `feat: add participant session state service with atomic timeout sweep`.

### Task 13: Start subtest

**Files:** Create `app/api/sessions/[token]/subtests/[code]/start/route.ts`; extend `lib/server/participant-session.ts`; extend `tests/integration/participant-session.test.ts`.

**Step 1:** Failing tests:
- from `tutorial` with `current_subtest_code=SE`, `startSubtest(db, token, "SE")` → creates attempt (`duration_seconds` from `subtest_versions`, `expires_at = started_at + duration`), session → `subtest_in_progress`, sets session `started_at` on first subtest, returns `{ attemptId, expiresAt, serverNow, items }` where items = `{ itemVersionId, itemNumber, localNumber, itemType, prompt, options: [{optionCode, label}], placeholder }` — **no rule/key fields exist in the DTO type**.
- starting wrong code (`WA` while current is `SE`) → `WRONG_SUBTEST` 409.
- starting twice → second call returns the SAME attempt (idempotent resume), not a new timer ("opening a new tab does not create a new timer").
- starting when session `final`/`void` → `SESSION_NOT_ACTIVE`.

**Step 2:** Implement inside a transaction: `select … for update` on the session row (PGlite supports it; on Drizzle use `.for("update")`), unique index `attempt_session_subtest_ux` is the safety net against races. Audit `subtest.started`.

**Step 3:** Route handler wiring. `npm test` → PASS. Commit `feat: add server-authoritative subtest start`.

### Task 14: Save / skip responses (idempotent autosave)

**Files:** Create `app/api/sessions/[token]/responses/[itemId]/route.ts` (PUT), `app/api/sessions/[token]/responses/[itemId]/skip/route.ts` (POST), `app/api/sessions/[token]/subtests/[code]/unanswered/route.ts` (GET); extend service + tests.

**Step 1:** Failing tests:
- `saveResponse(db, token, itemVersionId, value)` on active attempt → upsert (`on conflict (subtest_attempt_id, item_version_id)`), status `answered` first time, `changed` when value differs on re-save, `answered_at` kept from first answer, `updated_at` bumped. Returns `{ status, savedAt, remainingSeconds }`.
- same value re-sent (autosave retry) → no status flip to `changed` (idempotent), still 200.
- `skipResponse` → status `skipped`, `response_value` null.
- item not in the active attempt's subtest → `ITEM_NOT_IN_ACTIVE_SUBTEST` 409.
- `expires_at` passed → sweep runs, save rejected `TIME_EXPIRED` 410 ("Server rejects answers submitted after expires_at").
- response on locked/completed attempt → `SUBTEST_LOCKED` 409.
- value schema: choice items accept only existing `optionCode` for that item (validate against `item_options`); numeric/short_text accept bounded strings (`max 500` chars). Invalid → 422.
- `getUnanswered(db, token, code)` → `{ items: [{ itemNumber, localNumber, status }] }` for `skipped` + never-answered.

**Step 2:** Implement — all checks inside one transaction with the attempt row locked. Response DTO never echoes correctness.

**Step 3:** Routes (PUT + POST + GET) with zod bodies `{ value: string, clientTimestamp?: string }` (clientTimestamp logged for drift diagnostics only, never trusted). `npm test` → PASS. Commit `feat: add idempotent response save, skip, and unanswered review`.

### Task 15: Complete subtest + finish test

**Files:** Create `app/api/sessions/[token]/subtests/[code]/complete/route.ts`, `app/api/sessions/[token]/finish/route.ts`; extend service + tests.

**Step 1:** Failing tests:
- `completeSubtest` (manual): attempt → `completed/manual`, unanswered items stay `unanswered` (rows created lazily = simply absent; unanswered = itemCount − responses), responses `locked_at` set, session `subtest_in_progress → subtest_completed → tutorial_next` with `current_subtest_code` = next; audit `subtest.completed`.
- completing an already-completed subtest → `SUBTEST_LOCKED` (no return to completed subtests).
- completing ME (last) → `subtest_completed → test_completed`, session `completed_at` set.
- `finishTest`: only valid from `test_completed` → `needs_ge_scoring`; audit `session.finished`; idempotent (second call → current state, no error) — the UI calls it right after ME completes.

**Step 2:** Implement + route handlers. `npm test` → PASS. Commit `feat: add subtest completion and test finish transitions`.

### Task 16: Participant UI — entry, tutorial, transition, complete (token routes)

**Files:** Create `app/test/page.tsx` (code entry), `app/test/[token]/tutorial/[subtest]/page.tsx`, `app/test/[token]/transition/page.tsx`, `app/test/[token]/complete/page.tsx`, `components/participant/start-subtest-button.tsx` (client); Modify `app/page.tsx` (redirect to `/test`), `components/participant/access-entry.tsx`, `components/participant/tutorial-screen.tsx`; Delete `app/test/tutorial/page.tsx`, `app/test/complete/page.tsx`.

**Step 1:** `access-entry.tsx`: replace `validateAccessCode` import from `ist-logic` with `fetch("/api/access-codes/validate", { method: "POST", body: JSON.stringify({ code }) })`; on success `router.push(nextRoute)`; render `error.message` from the envelope for CODE_INVALID/EXPIRED/REVOKED/IN_USE/RATE_LIMITED states (keep existing visual states).

**Step 2:** Tutorial page = async server component: `const { token, subtest } = await params;` → call `getSessionState(getDb(), token)` directly (no HTTP hop). If `nextRoute` doesn't match this page (wrong subtest/status), `redirect(nextRoute)` — this makes refresh/resume land correctly everywhere. Feed `tutorial-screen.tsx` via props (pinned tutorial text/video, item count, duration, "Timer belum dimulai" badge). `start-subtest-button.tsx` (client): POST start endpoint → `router.push(\`/test/${token}/question/${subtest}/1\`)`.

**Step 3:** Transition page: server component reading state → shows "subtes selesai / tidak dapat kembali" then links (or meta-refresh) to `nextRoute`. Complete page: closing screen, **no results** shown; calls nothing.

**Step 4:** `app/page.tsx` → `redirect("/test")` (spec: `/test` is code entry). Delete replaced prototype routes. Grep for imports of deleted pages/`getAccessCodeStatus` usages; clean `ist-logic.ts` of the mock-only functions (`getAccessCodeStatus`, `validateAccessCode`) and their tests.

**Step 5:** `npm run build` → compiles. Manual smoke (`npm run dev` + seeded session): enter code → tutorial SE renders. Commit `feat: wire participant entry, tutorial, transition, complete to server engine`.

### Task 17: Participant UI — question + review pages with server autosave

**Files:** Create `app/test/[token]/question/[subtest]/[item]/page.tsx`, `app/test/[token]/review/[subtest]/page.tsx`, `components/participant/use-autosave.ts` (client hook); Modify `components/participant/test-session.tsx`, `test-question-panel.tsx`, `test-session-sidebar.tsx`; Delete `app/test/session/page.tsx`, `lib/session-store.ts` (and its imports).

**Step 1:** Question page (server component): resolve state; if attempt missing/closed → `redirect(nextRoute)`. Pass to `test-session.tsx`: token, subtest meta, items array (from start/state DTO), current item number, `expiresAt`, `serverNow`, per-item statuses.

**Step 2:** Rework `test-session.tsx` (client):
- Timer: compute offset `serverNow - Date.now()` once, tick display from `expiresAt` (never trust device clock alone). At 0 → call heartbeat once → follow returned `nextRoute` (auto-advance, no confirm dialog).
- `use-autosave.ts`: debounced PUT with retry (1 retry after 2s), exposes `"menyimpan" | "tersimpan" | "gagal"` for the existing autosave indicator.
- `Jawab & Lanjut` → PUT then `router.push` next item; `Lewati` → skip endpoint then next. Sidebar statuses from server DTO; skipped items navigable while active.
- Keyboard support preserved (existing behavior).

**Step 3:** Review page: GET unanswered → list linking back to `/test/{token}/question/{code}/{n}`; "Selesaikan subtes" button → complete endpoint → transition page. After ME complete → call finish → complete page.

**Step 4:** Delete `lib/session-store.ts`; `npx tsc --noEmit` to catch dangling imports. `npm run build` passes.

**Step 5:** Manual smoke: answer + skip + revisit + let timer expire on a short-duration test session (temporarily seed a 10-second SE via a `scripts/seed-e2e.ts` fixture — write it now; also used by T34). Commit `feat: wire question and review pages to server autosave and timer`.

### Task 18: Nine-subtest engine integration test

**Files:** Test `tests/integration/full-flow.test.ts`.

**Step 1:** Service-level end-to-end on PGlite (no HTTP): validate code → for each of 9 subtests: state → start → answer ~half, skip a few → complete; assert order enforcement, then finish → `needs_ge_scoring`. Include: refresh semantics (call `getSessionState` mid-attempt — same `expiresAt`), reconnect-after-timeout (manually backdate `expires_at` via SQL, then state → next tutorial), double-attempt rejection.

**Step 2:** `npm test` → PASS. Commit `test: add nine-subtest end-to-end engine test`.

**Phase 2 exit check:** full-flow test green including refresh, disconnect, double-tab, timeout paths.

---

## Phase 3 — HR Operations (brief §21 Phase 3)

### Task 19: HR services + candidate/session endpoints

**Files:** Create `lib/server/hr.ts`, `app/api/hr/candidates/route.ts` (POST+GET), `app/api/hr/sessions/route.ts` (POST+GET), `app/api/hr/sessions/[id]/route.ts` (GET); Test `tests/integration/hr.test.ts`.

**Step 1:** Failing tests:
- `createCandidate(db, ctx, input)` — zod-validated (fullName, birthDate ISO past date, testPurpose required), org scoping from ctx, audit `candidate.created`.
- `createSession(db, ctx, { candidateId, expiresInHours })` — pins the published `form/scoring key/norm set` version ids + `pinnedTutorialVersions` map at creation (spec §10A); generates code (hash + masked stored, **plaintext returned once**); status `code_generated`; audit `session.created` + `access_code.generated` (masked only in metadata).
- `listSessions(db, ctx, { status?, query? })` — joins candidate + code status + progress counts (answered/skipped/unanswered via aggregate over responses/attempts); org-scoped.
- `getSessionDetail` — per-subtest progress, durations, current state; candidate from another org → `NOT_FOUND` (no existence leak).

**Step 2:** Implement; route handlers all start with `requireHrUser` + `assertSameOrigin` (mutations). Follow spec §18 shapes.

**Step 3:** `npm test` → PASS. Commit `feat: add HR candidate and session services with version pinning`.

### Task 20: Access-code revoke / regenerate

**Files:** Create `app/api/hr/sessions/[id]/access-code/revoke/route.ts`, `.../regenerate/route.ts`; extend `lib/server/hr.ts` + tests.

**Step 1:** Failing tests:
- revoke: code → `revoked` + `revoked_at`; participant tokens revoked; subsequent participant validate/state → `CODE_REVOKED`/`TOKEN_INVALID`; audit.
- regenerate: old code → `regenerated` (kept, linked via `regenerated_from_id`), new active code returned in plaintext once; only for sessions not `final/void/cancelled`; completed code → `CODE_ALREADY_COMPLETED` 409.

**Step 2:** Implement + routes. `npm test` → PASS. Commit `feat: add access-code revoke and regenerate`.

### Task 21: HR UI — participants, sessions, detail with real data

**Files:** Modify `app/hr/participants/page.tsx`, `app/hr/participants/new/page.tsx`, `components/hr/participant-create-form.tsx`, `app/hr/sessions/page.tsx`, `app/hr/sessions/new/page.tsx`, `components/hr/session-create-form.tsx`, `app/hr/sessions/[sessionId]/page.tsx`.

**Step 1:** Pages become async server components calling `lib/server/hr.ts` directly with `requireHrUser` context (layout already guards). Lists: real rows, existing table/card styling, status labels konsisten, filter/search via `searchParams`.

**Step 2:** Forms post to server actions (`app/hr/participants/new/actions.ts`, `app/hr/sessions/new/actions.ts`) that call the same services (services stay the single mutation path; actions add `assertSameOrigin`-equivalent by being server actions). Session-create success screen shows the plaintext code ONCE with copy button + expiry, and warns it won't be shown again (list shows `codeMasked`).

**Step 3:** Session detail: progress per subtest, answered/skipped/unanswered, durations, code status, revoke/regenerate buttons (client component → API routes, confirm dialogs, reason optional in audit metadata). Remove `PrototypeBadge` from these pages only.

**Step 4:** `npm run build`; manual smoke: create candidate → session → copy code → run participant flow with it. Commit `feat: wire HR participants and sessions to production services`.

### Task 22: Dashboard metrics + audit viewer + `view_results` enforcement

**Files:** Modify `app/hr/page.tsx`, `app/admin/audit/page.tsx`; Create `lib/server/metrics.ts`; extend `tests/integration/hr.test.ts`.

**Step 1:** `metrics.ts`: month-to-date sessions created, active (in tutorial/subtest states), waiting GE, final count, 10 recent sessions — single grouped queries, org-scoped. Test with fixtures.

**Step 2:** `app/hr/page.tsx` renders real metrics via existing `stat-card`. `app/admin/audit/page.tsx`: paginated real `audit_logs` (org-scoped, newest first, metadata pretty-printed) — super_admin only (layout already enforces).

**Step 3:** `view_results` check goes into result/report services later (T27/T29/T31) — write the failing authz test now in `tests/integration/hr.test.ts`: super_admin WITHOUT `view_results` calling `getResult` → 403 (test will be enabled when T27 lands; mark `todo` if needed).

**Step 4:** Commit `feat: add real dashboard metrics and audit log viewer`.

**Phase 3 exit check:** HR can run create-participant → create-session → code lifecycle → monitor progress entirely from the UI, no manual DB access.

---

## Phase 4 — Scoring & Norm Engine (brief §21 Phase 4)

### Task 23: Pure domain — norm band selection & lookup

**Files:** Create `lib/domain/norms.ts`; Test `tests/unit/norms.test.ts`.

**Step 1:** Failing tests (spec §15): exact `min_age <= age <= max_age` selection; age outside all bands → `{ kind: "needs_review", reason: "NO_AGE_BAND" }` (NEVER closest-band); boundary ages (19 vs 20) select different bands; same raw different band → different standard score; missing norm row → needs_review.

**Step 2:**

```ts
export type AgeBand = { readonly id: string; readonly label: string; readonly minAge: number; readonly maxAge: number };
export type NormRow = { readonly subtestCode: string; readonly rawScore: number; readonly standardScore: number };

export type BandSelection =
  | { readonly kind: "ok"; readonly band: AgeBand }
  | { readonly kind: "needs_review"; readonly reason: "NO_AGE_BAND" | "AMBIGUOUS_AGE_BAND" };

export function selectAgeBand(bands: readonly AgeBand[], age: number): BandSelection {
  const matches = bands.filter((band) => age >= band.minAge && age <= band.maxAge);
  if (matches.length === 1) return { kind: "ok", band: matches[0] };
  return { kind: "needs_review", reason: matches.length === 0 ? "NO_AGE_BAND" : "AMBIGUOUS_AGE_BAND" };
}

export function lookupStandardScore(
  rows: readonly NormRow[], subtestCode: string, rawScore: number,
): number | null {
  return rows.find((row) => row.subtestCode === subtestCode && row.rawScore === rawScore)
    ?.standardScore ?? null;
}
```

**Step 3:** PASS + commit `feat: add norm band selection and lookup domain module`.

### Task 24: Pure domain — objective scoring

**Files:** Create `lib/domain/objective-scoring.ts`; Test `tests/unit/objective-scoring.test.ts`.

**Step 1:** Failing tests (spec §14): option_match exact `optionCode` equality → 1/0 (no trimming/fuzzy for choice); numeric_match: normalize by trim + strip trailing `.0`? NO — **explicit variants only**: response string must equal one of `acceptedValues` after `trim()` (case-sensitive digits); skipped/unanswered/absent → 0; manual_ge rules are NOT scorable here → `{ kind: "requires_manual" }`.

**Step 2:**

```ts
export type ObjectiveRule =
  | { readonly ruleType: "option_match"; readonly payload: { readonly correctOptionCodes: readonly string[] } }
  | { readonly ruleType: "numeric_match"; readonly payload: { readonly acceptedValues: readonly string[] } }
  | { readonly ruleType: "manual_ge"; readonly payload: Record<string, unknown> };

export type ObjectiveOutcome =
  | { readonly kind: "scored"; readonly score: 0 | 1 }
  | { readonly kind: "requires_manual" };

export function scoreObjective(rule: ObjectiveRule, responseValue: string | null): ObjectiveOutcome {
  if (rule.ruleType === "manual_ge") return { kind: "requires_manual" };
  if (responseValue === null) return { kind: "scored", score: 0 };
  if (rule.ruleType === "option_match") {
    return { kind: "scored", score: rule.payload.correctOptionCodes.includes(responseValue) ? 1 : 0 };
  }
  return { kind: "scored", score: rule.payload.acceptedValues.includes(responseValue.trim()) ? 1 : 0 };
}
```

**Step 3:** PASS + commit `feat: add objective scoring domain module`.

### Task 25: GE manual scoring workflow

**Files:** Create `lib/server/ge-scoring.ts`, `app/api/hr/sessions/[id]/ge-scores/route.ts` (PUT + GET); Modify `app/hr/scoring/[sessionId]/ge/page.tsx`, `components/hr/ge-scoring-board.tsx`; Test `tests/integration/ge-scoring.test.ts`.

**Step 1:** Failing tests:
- `listGeItems(db, ctx, sessionId)` → 16 GE items with participant responses (original text preserved) + existing scores.
- `saveGeScores(db, ctx, sessionId, [{ responseId, score: 0|1|2, note? }])` → upserts `item_scores` with `scored_by`, `scored_at`; session must be `needs_ge_scoring`; scoring an unanswered item allowed (score 0 recorded explicitly).
- Re-scoring an already-scored item WITHOUT `overrideReason` → `OVERRIDE_REASON_REQUIRED` 422; with reason → new value + audit `ge.overridden`.
- `isGeComplete(db, sessionId)` — true only when all 16 GE responses have scores (unanswered GE items count once scored-0 by HR; decide: unanswered GE items are auto-scored 0 during calculate — completeness = all *answered* GE responses scored; test both).

**Step 2:** Implement + routes (`requireHrUser`, org scope). Wire the existing scoring board UI: real items, rubric 0/1/2 buttons, per-item note, save-all action, completeness banner ("X dari 16 dinilai").

**Step 3:** PASS + build + commit `feat: add GE manual scoring workflow with override audit`.

### Task 26: Pure domain — aggregate: IQ, categories, dominance (PLACEHOLDER)

**Files:** Create `lib/domain/aggregate.ts`; Test `tests/unit/aggregate.test.ts`.

**Step 1:** Failing tests for the placeholder rules (all constants exported + named `PLACEHOLDER_*` so swapping official formulas is a version bump, not a hunt):
- `iqFromTotalStandard(totalSW)` = `Math.round(totalSW / 9)` (placeholder).
- `categoryForStandardScore(sw)`: <90 `"Di bawah rata-rata"`, 90–109 `"Rata-rata"`, 110–119 `"Di atas rata-rata"`, ≥120 `"Superior"` — test every boundary (89/90, 109/110, 119/120).
- `dominanceProfile(scores: Record<SubtestCode, number>)` → groups verbal `[SE,WA,AN,GE,ME]`, numeric `[RA,ZR]`, figural `[FA,WU]`; returns `{ dominance: "verbal"|"numerik"|"figural", groupMeans }`; ties → first by that order (documented).

**Step 2:** Implement with a file-top comment block: `// PLACEHOLDER FORMULAS — bukan formula IST resmi. Ganti via scoring_rule version setelah rekonsiliasi psikolog (brief §24).`

**Step 3:** PASS + commit `feat: add placeholder aggregate scoring domain module`.

### Task 27: Calculation pipeline + calculate/result endpoints

**Files:** Create `lib/server/calculate.ts`, `app/api/hr/sessions/[id]/calculate/route.ts`, `app/api/hr/results/[id]/route.ts`; Test `tests/integration/calculate.test.ts`.

**Step 1:** Failing tests:
- happy path: seeded session with known responses + GE scores → `calculateResult(db, ctx, sessionId)` runs pipeline (spec §14): validate session `needs_ge_scoring` + GE complete → objective scores persisted as `item_scores` (scoredBy null) → RW per subtest (sum incl. GE manual scores for GE) → age via `calculateExactAge(birthDate, session.startedAt)` → band via `selectAgeBand` → SW lookup per subtest → totals → IQ/category/dominance → insert `assessment_results` (status `waiting_ge`? no: GE done ⇒ `draft`) + 9 `subtest_scores` rows in ONE transaction; session → `calculated`; audit `result.calculated`. Every version id + `engineVersion` stored.
- GE incomplete → `GE_INCOMPLETE` 409, nothing persisted.
- age outside bands → result created with status `needs_review`? — No: session → `needs_review`, NO result row (spec §15 "status menjadi needs_review"); audit reason.
- recalculate (second call, session `calculated`): allowed with `requirePermission(ctx, "recalculate")`? Keep simple: allowed for hr_admin; creates NEW result row, previous non-final result → `superseded` + `supersededById`; final results are never superseded silently → if latest is `final`, require override path (T29). Reproducibility: run calculate twice on identical data → identical numbers.
- `getResult(db, ctx, sessionId)` returns the table+chart DTO of spec §16 (identity, ages, RW/SW/category per subtest, totals, IQ, dominance, versions, chart array in order `SE, WA, AN, GE, ME, RA, ZR, FA, WU`); enforces `view_results` (enable T22's pending test).

**Step 2:** Implement. Chart order constant `CHART_ORDER` lives in `lib/domain/aggregate.ts`. Result DTO computed server-side only — the chart component must not recompute.

**Step 3:** Route handlers. PASS + commit `feat: add reproducible calculation pipeline with version snapshot`.

### Task 28: Golden dataset harness

**Files:** Create `tests/golden/cases.json`, `tests/golden/golden.test.ts`, `scripts/generate-golden-cases.ts`.

**Step 1:** `scripts/generate-golden-cases.ts` builds `cases.json` deterministically from the PLACEHOLDER key/norms: each case = `{ name, birthDate, testDate, responses: {globalNumber: value|"SKIP"|null}, geScores, expected: { rwPerSubtest, swPerSubtest, total, iq, category, dominance, resultStatus } }`. Generate ≥12 curated cases covering: every age band (8), birthday-on-test-date ±1 day (3), min raw (all wrong/skip), max raw (all correct), all-GE-0 / all-GE-2, timeout-with-partial-answers, needs_review (age 14).

**Step 2:** `golden.test.ts`: for each case — fresh PGlite, seed via `runSeed`, create candidate/session with the case's birthDate, inject responses through the REAL services (start/save/complete per subtest; timeout case via backdated `expires_at`), save GE scores, calculate, assert every expected number matches exactly (100% match required, brief §22).

**Step 3:** PASS (dataset self-consistent by construction; the harness is what matters — official dataset replaces `cases.json` + seed when psychologist signs off). Commit `test: add golden dataset harness with placeholder cases`.

**Phase 4 exit check:** golden run 100% green; boundary tests (age, category thresholds) green; every result row carries form/key/norm/engine versions.

---

## Phase 5 — Results & Reporting (brief §21 Phase 5)

### Task 29: Result workflow — finalize, override, supersede

**Files:** Create `app/api/hr/results/[id]/finalize/route.ts`; extend `lib/server/calculate.ts` (or new `lib/server/results.ts`) + tests.

**Step 1:** Failing tests:
- `finalizeResult(db, ctx, resultId)`: only from `draft`/`reviewed`; transaction sets result `final` + `finalized_by/at`, session → `final`; audit `result.finalized`.
- editing/finalizing an already-final result → `RESULT_LOCKED` 409.
- re-score over a final result requires `{ overrideReason }` in the calculate call + permission; old final → `superseded` with audit `result.overridden` containing the reason; new result starts at `draft`.
- `reviewResult(resultId, notes)`: `draft → reviewed` with `review_notes`.

**Step 2:** Implement + route. PASS + commit `feat: add result finalize, review, and audited override`.

### Task 30: Results UI + chart from backend data

**Files:** Modify `app/hr/results/[sessionId]/page.tsx` and the chart/table components it uses; Create `components/hr/result-chart.tsx` if the prototype chart is inline.

**Step 1:** Server component fetches `getResult` DTO; render identity, age/norm band, versions (visible: "Norma: PLACEHOLDER v1"), RW/SW/category table, IQ + category, dominance, review notes, status badge; chart consumes `dto.chart` array verbatim (order `SE, WA, AN, GE, ME, RA, ZR, FA, WU`), values labeled — table and chart share the same DTO so they cannot diverge.

**Step 2:** Actions: "Hitung hasil" (visible in `needs_ge_scoring` w/ GE complete), "Tandai reviewed", "Finalisasi" (confirm dialog), each hitting the API routes. Statuses `waiting_ge → draft → reviewed → final → superseded` shown with consistent labels.

**Step 3:** Build + manual smoke with a calculated seed session. Commit `feat: wire results page and nine-subtest chart to calculation snapshot`.

### Task 31: PDF report generation + private storage + download

**Files:** Create `lib/providers/storage.ts`, `lib/server/reports.ts`, `lib/server/report-pdf.tsx`, `app/api/hr/results/[id]/report/route.ts` (POST = generate, GET = download); Test `tests/integration/reports.test.ts` (+ a PDF snapshot check).

**Step 1:** `npm i @react-pdf/renderer`.

**Step 2:** `lib/providers/storage.ts` — `StorageProvider` interface (`upload(bucket, path, bytes)`, `createSignedUrl(bucket, path, expiresInSeconds)`) + Supabase implementation using `SUPABASE_SECRET_KEY` client; a `MemoryStorageProvider` for tests.

**Step 3:** Failing tests:
- `generateReport(db, storage, ctx, resultId)`: only for `final` results (`RESULT_NOT_FINAL` 409 otherwise); renders PDF buffer from the SAME result DTO as the screen (identity, table, chart drawn as `View` bars, versions, "Laporan ini tidak memuat keputusan otomatis diterima/ditolak." footer + PLACEHOLDER watermark while norms are placeholder); `file_hash = sha256(buffer)`; stores at `reports/{sessionId}/{reportId}.pdf` in `SUPABASE_REPORT_BUCKET`; inserts `reports` row with incremented `report_version`; audit `report.generated`.
- regenerate → new version row, old file kept (immutable).
- `getReportDownload(db, storage, ctx, reportId)` → authz (`view_results` + org) → signed URL (120 s); audit `report.downloaded`.
- PDF determinism: hash stable across two renders of same data (embed no timestamps in the doc body; `generatedAt` lives in DB, printed as fixed text from the result's `finalizedAt`).

**Step 4:** Implement `report-pdf.tsx` with `renderToBuffer(<ReportDocument data={dto} />)`. Route handlers: POST generate, GET redirect (302) to signed URL. PASS + commit `feat: add versioned hashed pdf reports in private storage`.

### Task 32: Reports UI

**Files:** Modify `app/hr/reports/[sessionId]/page.tsx`.

**Step 1:** Server component: latest result + report rows; preview = the same result DTO rendered read-only; "Generate laporan" (only when final), report history table (version, hash prefix, generated by/at), "Unduh" → GET download route. Non-final → existing locked state UI.

**Step 2:** Build + manual smoke: finalize → generate → download opens PDF. Commit `feat: wire report preview, generation, and download`.

**Phase 5 exit check:** screen and PDF identical (same DTO), traceable to versions, download authz-tested.

---

## Hardening & wrap-up

### Task 33: Security headers, README, full verification

**Files:** Modify `next.config.ts`, `README.md`; Create `docs/OPERATIONS.md` (short runbook).

**Step 1:** `next.config.ts` `headers()`: `Strict-Transport-Security` (prod only), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a baseline CSP (`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; object-src 'none'; base-uri 'self'`). Note in OPERATIONS.md: move to nonce-based CSP before go-live (Phase 6).

**Step 2:** README: replace prototype framing — real run instructions (env setup, `db:migrate`, `db:seed`, `create-admin`), architecture map (`lib/domain` / `lib/server` / providers), what's placeholder vs production-ready, pointer to this plan + brief phases.

**Step 3:** `docs/OPERATIONS.md`: create admin, rotate pepper/secret implications (pepper rotation invalidates codes — document), revoke flow, backup expectations (Supabase PITR), what Phase 6+ still requires (threat model, restore drill, UAT, pilot) so nobody calls this production-ready prematurely (brief §28).

**Step 4:** Full gate: `npm run lint && npx tsc --noEmit && npm test && npm run build` → all green. Commit `chore: add security headers, operations notes, and production readme`.

### Task 34: Playwright E2E (critical flows)

**Files:** Create `playwright.config.ts`, `e2e/participant-flow.spec.ts`, `e2e/hr-flow.spec.ts`; Modify `package.json` (`"test:e2e": "playwright test"`); use `scripts/seed-e2e.ts` (short 10–15 s subtest durations, separate `IST-E2E` form code).

**Step 1:** `npm i -D @playwright/test && npx playwright install chromium`. Config: `webServer: { command: "npm run dev", url: APP_BASE_URL }`, baseURL from env; tests assume `.env.local` + seeded e2e data (document in file header; CI wiring is Phase 6).

**Step 2:** `participant-flow.spec.ts`: invalid code shows error; valid e2e code → tutorial → start → answer/skip → review → complete subtest → (short timer) timeout auto-advances → finish → complete page shows no scores. Deterministic waits (`expect(locator)`), no `waitForTimeout` except the intentional timer expiry (bounded).

**Step 3:** `hr-flow.spec.ts`: login → create candidate → create session (code visible once) → participant completes (API shortcut via request context is fine) → GE scoring → calculate → finalize → chart visible → generate report → download responds 200/302.

**Step 4:** `npm run test:e2e` → green locally. Commit `test: add playwright e2e for participant and hr critical flows`.

---

## Milestone map (commit → brief exit gate)

| After task | Brief milestone |
|---|---|
| T8 | Phase 1 — Production Foundation |
| T18 | Phase 2 — Participant Session Engine |
| T22 | Phase 3 — HR Operations |
| T28 | Phase 4 — Scoring & Norm Engine (placeholder data, real engine) |
| T32 | Phase 5 — Result & Reporting |
| T34 | Hardening + E2E; Phases 6–10 (security testing, UAT, pilot, go-live) remain — do NOT declare production-ready |
