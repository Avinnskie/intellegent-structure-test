CREATE TYPE "public"."access_code_status" AS ENUM('active', 'in_use', 'completed', 'expired', 'revoked', 'regenerated');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('user', 'participant', 'system');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."completion_reason" AS ENUM('manual', 'timeout', 'admin');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'in_review', 'approved', 'published', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('choice', 'short_text', 'numeric');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."response_status" AS ENUM('unanswered', 'answered', 'skipped', 'changed', 'locked');--> statement-breakpoint
CREATE TYPE "public"."result_status" AS ENUM('waiting_ge', 'draft', 'reviewed', 'final', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."rule_type" AS ENUM('option_match', 'numeric_match', 'manual_ge');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('code_generated', 'code_validated', 'tutorial', 'subtest_in_progress', 'subtest_completed', 'tutorial_next', 'test_completed', 'needs_ge_scoring', 'calculated', 'reviewed', 'final', 'paused_by_admin', 'expired', 'cancelled', 'invalidated', 'needs_review', 'void');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('hr_admin', 'super_admin');--> statement-breakpoint
CREATE TABLE "access_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"code_masked" text NOT NULL,
	"status" "access_code_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"regenerated_from_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "assessment_form_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_code" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"effective_date" date,
	"approved_by" text,
	"checksum" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"status" "result_status" DEFAULT 'draft' NOT NULL,
	"age_at_test" integer NOT NULL,
	"norm_age_band_id" uuid,
	"total_raw_score" integer NOT NULL,
	"total_standard_score" integer NOT NULL,
	"iq_score" integer,
	"iq_category" text,
	"dominance" text,
	"profile" jsonb,
	"form_version_id" uuid NOT NULL,
	"scoring_key_version_id" uuid NOT NULL,
	"norm_set_version_id" uuid NOT NULL,
	"engine_version" text NOT NULL,
	"review_notes" text,
	"superseded_by_id" uuid,
	"calculated_by" uuid NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_by" uuid,
	"finalized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assessment_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"form_version_id" uuid NOT NULL,
	"scoring_key_version_id" uuid NOT NULL,
	"norm_set_version_id" uuid NOT NULL,
	"pinned_tutorial_versions" jsonb NOT NULL,
	"status" "session_status" DEFAULT 'code_generated' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"age_at_test" integer,
	"current_subtest_code" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"external_reference" text,
	"full_name" text NOT NULL,
	"birth_date" date NOT NULL,
	"gender" text,
	"education" text,
	"test_purpose" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_version_id" uuid NOT NULL,
	"option_code" text NOT NULL,
	"label" text NOT NULL,
	"sequence" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"scoring_rule_id" uuid,
	"scored_by" uuid,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"override_reason" text
);
--> statement-breakpoint
CREATE TABLE "item_scoring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scoring_key_version_id" uuid NOT NULL,
	"item_version_id" uuid NOT NULL,
	"rule_type" "rule_type" NOT NULL,
	"rule_payload" jsonb NOT NULL,
	"max_score" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subtest_version_id" uuid NOT NULL,
	"item_number" integer NOT NULL,
	"item_type" "item_type" NOT NULL,
	"prompt" text NOT NULL,
	"media_reference" text,
	"placeholder" text,
	"sequence" integer NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "norm_age_bands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"norm_set_version_id" uuid NOT NULL,
	"label" text NOT NULL,
	"min_age" integer NOT NULL,
	"max_age" integer NOT NULL,
	CONSTRAINT "norm_band_age_range_ck" CHECK (min_age <= max_age)
);
--> statement-breakpoint
CREATE TABLE "norm_score_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"norm_age_band_id" uuid NOT NULL,
	"subtest_code" text NOT NULL,
	"raw_score" integer NOT NULL,
	"standard_score" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "norm_set_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_version_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"population_reference" text,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"effective_date" date,
	"approved_by" text,
	"checksum" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "participant_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"result_id" uuid NOT NULL,
	"report_version" integer NOT NULL,
	"storage_reference" text NOT NULL,
	"file_hash" text NOT NULL,
	"generated_by" uuid NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"subtest_attempt_id" uuid NOT NULL,
	"item_version_id" uuid NOT NULL,
	"response_value" jsonb,
	"response_status" "response_status" DEFAULT 'unanswered' NOT NULL,
	"answered_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scoring_key_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_version_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"effective_date" date,
	"approved_by" text,
	"checksum" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subtest_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"subtest_version_id" uuid NOT NULL,
	"subtest_code" text NOT NULL,
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_seconds" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"completion_reason" "completion_reason"
);
--> statement-breakpoint
CREATE TABLE "subtest_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"result_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"subtest_code" text NOT NULL,
	"raw_score" integer NOT NULL,
	"standard_score" integer NOT NULL,
	"category" text NOT NULL,
	"norm_age_band_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subtest_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_version_id" uuid NOT NULL,
	"code" text NOT NULL,
	"sequence" integer NOT NULL,
	"title" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"item_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutorial_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subtest_version_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"text_content" text NOT NULL,
	"video_reference" text,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"effective_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_regenerated_from_id_access_codes_id_fk" FOREIGN KEY ("regenerated_from_id") REFERENCES "public"."access_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_norm_age_band_id_norm_age_bands_id_fk" FOREIGN KEY ("norm_age_band_id") REFERENCES "public"."norm_age_bands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_form_version_id_assessment_form_versions_id_fk" FOREIGN KEY ("form_version_id") REFERENCES "public"."assessment_form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_scoring_key_version_id_scoring_key_versions_id_fk" FOREIGN KEY ("scoring_key_version_id") REFERENCES "public"."scoring_key_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_norm_set_version_id_norm_set_versions_id_fk" FOREIGN KEY ("norm_set_version_id") REFERENCES "public"."norm_set_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_superseded_by_id_assessment_results_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."assessment_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_calculated_by_users_id_fk" FOREIGN KEY ("calculated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_form_version_id_assessment_form_versions_id_fk" FOREIGN KEY ("form_version_id") REFERENCES "public"."assessment_form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_scoring_key_version_id_scoring_key_versions_id_fk" FOREIGN KEY ("scoring_key_version_id") REFERENCES "public"."scoring_key_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_norm_set_version_id_norm_set_versions_id_fk" FOREIGN KEY ("norm_set_version_id") REFERENCES "public"."norm_set_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_options" ADD CONSTRAINT "item_options_item_version_id_item_versions_id_fk" FOREIGN KEY ("item_version_id") REFERENCES "public"."item_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_scores" ADD CONSTRAINT "item_scores_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_scores" ADD CONSTRAINT "item_scores_scoring_rule_id_item_scoring_rules_id_fk" FOREIGN KEY ("scoring_rule_id") REFERENCES "public"."item_scoring_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_scores" ADD CONSTRAINT "item_scores_scored_by_users_id_fk" FOREIGN KEY ("scored_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_scoring_rules" ADD CONSTRAINT "item_scoring_rules_scoring_key_version_id_scoring_key_versions_id_fk" FOREIGN KEY ("scoring_key_version_id") REFERENCES "public"."scoring_key_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_scoring_rules" ADD CONSTRAINT "item_scoring_rules_item_version_id_item_versions_id_fk" FOREIGN KEY ("item_version_id") REFERENCES "public"."item_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_versions" ADD CONSTRAINT "item_versions_subtest_version_id_subtest_versions_id_fk" FOREIGN KEY ("subtest_version_id") REFERENCES "public"."subtest_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm_age_bands" ADD CONSTRAINT "norm_age_bands_norm_set_version_id_norm_set_versions_id_fk" FOREIGN KEY ("norm_set_version_id") REFERENCES "public"."norm_set_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm_score_rows" ADD CONSTRAINT "norm_score_rows_norm_age_band_id_norm_age_bands_id_fk" FOREIGN KEY ("norm_age_band_id") REFERENCES "public"."norm_age_bands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm_set_versions" ADD CONSTRAINT "norm_set_versions_form_version_id_assessment_form_versions_id_fk" FOREIGN KEY ("form_version_id") REFERENCES "public"."assessment_form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_tokens" ADD CONSTRAINT "participant_tokens_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_result_id_assessment_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."assessment_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_subtest_attempt_id_subtest_attempts_id_fk" FOREIGN KEY ("subtest_attempt_id") REFERENCES "public"."subtest_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_item_version_id_item_versions_id_fk" FOREIGN KEY ("item_version_id") REFERENCES "public"."item_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_key_versions" ADD CONSTRAINT "scoring_key_versions_form_version_id_assessment_form_versions_id_fk" FOREIGN KEY ("form_version_id") REFERENCES "public"."assessment_form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtest_attempts" ADD CONSTRAINT "subtest_attempts_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtest_attempts" ADD CONSTRAINT "subtest_attempts_subtest_version_id_subtest_versions_id_fk" FOREIGN KEY ("subtest_version_id") REFERENCES "public"."subtest_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtest_scores" ADD CONSTRAINT "subtest_scores_result_id_assessment_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."assessment_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtest_scores" ADD CONSTRAINT "subtest_scores_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtest_scores" ADD CONSTRAINT "subtest_scores_norm_age_band_id_norm_age_bands_id_fk" FOREIGN KEY ("norm_age_band_id") REFERENCES "public"."norm_age_bands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtest_versions" ADD CONSTRAINT "subtest_versions_form_version_id_assessment_form_versions_id_fk" FOREIGN KEY ("form_version_id") REFERENCES "public"."assessment_form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_versions" ADD CONSTRAINT "tutorial_versions_subtest_version_id_subtest_versions_id_fk" FOREIGN KEY ("subtest_version_id") REFERENCES "public"."subtest_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_code_session_ix" ON "access_codes" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_code_version_ux" ON "assessment_form_versions" USING btree ("form_code","version");--> statement-breakpoint
CREATE INDEX "result_session_ix" ON "assessment_results" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_org_status_ix" ON "assessment_sessions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "session_candidate_ix" ON "assessment_sessions" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "audit_org_created_ix" ON "audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_org_ix" ON "candidates" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_option_code_ux" ON "item_options" USING btree ("item_version_id","option_code");--> statement-breakpoint
CREATE INDEX "item_score_response_ix" ON "item_scores" USING btree ("response_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_key_item_ux" ON "item_scoring_rules" USING btree ("scoring_key_version_id","item_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_subtest_number_ux" ON "item_versions" USING btree ("subtest_version_id","item_number");--> statement-breakpoint
CREATE UNIQUE INDEX "norm_row_ux" ON "norm_score_rows" USING btree ("norm_age_band_id","subtest_code","raw_score");--> statement-breakpoint
CREATE UNIQUE INDEX "norm_set_version_ux" ON "norm_set_versions" USING btree ("form_version_id","version");--> statement-breakpoint
CREATE INDEX "participant_token_session_ix" ON "participant_tokens" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "response_attempt_item_ux" ON "responses" USING btree ("subtest_attempt_id","item_version_id");--> statement-breakpoint
CREATE INDEX "response_session_ix" ON "responses" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_key_version_ux" ON "scoring_key_versions" USING btree ("form_version_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_session_subtest_ux" ON "subtest_attempts" USING btree ("session_id","subtest_code");--> statement-breakpoint
CREATE UNIQUE INDEX "subtest_score_result_ux" ON "subtest_scores" USING btree ("result_id","subtest_code");--> statement-breakpoint
CREATE INDEX "subtest_score_session_ix" ON "subtest_scores" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subtest_form_code_ux" ON "subtest_versions" USING btree ("form_version_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "tutorial_subtest_version_ux" ON "tutorial_versions" USING btree ("subtest_version_id","version");