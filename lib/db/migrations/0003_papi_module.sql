CREATE TYPE "public"."papi_factor_kind" AS ENUM('role', 'need');--> statement-breakpoint
CREATE TYPE "public"."papi_option_code" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TYPE "public"."papi_segment_close_reason" AS ENUM('navigated', 'completed', 'stale', 'admin');--> statement-breakpoint
CREATE TYPE "public"."papi_skip_reason" AS ENUM('participant_declined', 'hr_closed_early', 'not_required');--> statement-breakpoint
ALTER TYPE "public"."session_status" ADD VALUE 'papi_pending' BEFORE 'test_completed';--> statement-breakpoint
ALTER TYPE "public"."session_status" ADD VALUE 'papi_tutorial' BEFORE 'test_completed';--> statement-breakpoint
ALTER TYPE "public"."session_status" ADD VALUE 'papi_in_progress' BEFORE 'test_completed';--> statement-breakpoint
ALTER TYPE "public"."session_status" ADD VALUE 'papi_completed' BEFORE 'test_completed';--> statement-breakpoint
CREATE TABLE "papi_attempt_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"papi_attempt_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"close_reason" "papi_segment_close_reason",
	CONSTRAINT "papi_segment_range_ck" CHECK (ended_at is null or ended_at >= started_at)
);
--> statement-breakpoint
CREATE TABLE "papi_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"papi_form_version_id" uuid NOT NULL,
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"completion_reason" "completion_reason",
	"resume_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "papi_factor_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"papi_result_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"factor_code" text NOT NULL,
	"factor_name" text NOT NULL,
	"group_code" text NOT NULL,
	"factor_kind" "papi_factor_kind" NOT NULL,
	"score" integer NOT NULL,
	"category" text NOT NULL,
	"interpretation" text,
	"interpretation_pending" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "papi_factor_score_range_ck" CHECK (score between 0 and 9)
);
--> statement-breakpoint
CREATE TABLE "papi_form_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_code" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"item_count" integer NOT NULL,
	"engine_version" text NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"effective_date" date,
	"approved_by" text,
	"checksum" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "papi_item_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"papi_form_version_id" uuid NOT NULL,
	"item_number" integer NOT NULL,
	"option_a_text" text NOT NULL,
	"option_a_factor" text NOT NULL,
	"option_b_text" text NOT NULL,
	"option_b_factor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "papi_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"papi_attempt_id" uuid NOT NULL,
	"item_number" integer NOT NULL,
	"option_code" "papi_option_code",
	"response_status" "response_status" DEFAULT 'unanswered' NOT NULL,
	"answered_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	CONSTRAINT "papi_response_item_range_ck" CHECK (item_number between 1 and 90)
);
--> statement-breakpoint
CREATE TABLE "papi_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"papi_attempt_id" uuid NOT NULL,
	"papi_form_version_id" uuid NOT NULL,
	"status" "result_status" DEFAULT 'draft' NOT NULL,
	"role_total" integer NOT NULL,
	"need_total" integer NOT NULL,
	"total_score" integer NOT NULL,
	"elapsed_seconds" integer NOT NULL,
	"profile" jsonb NOT NULL,
	"pending_interpretation_factors" text[] NOT NULL,
	"engine_version" text NOT NULL,
	"review_notes" text,
	"superseded_by_id" uuid,
	"calculated_by" uuid,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_by" uuid,
	"finalized_at" timestamp with time zone,
	CONSTRAINT "papi_result_total_ck" CHECK (total_score = 90)
);
--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD COLUMN "includes_papi" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD COLUMN "papi_form_version_id" uuid;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD COLUMN "papi_skip_reason" "papi_skip_reason";--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD COLUMN "papi_skipped_by" uuid;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD COLUMN "papi_skipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "papi_attempt_segments" ADD CONSTRAINT "papi_attempt_segments_papi_attempt_id_papi_attempts_id_fk" FOREIGN KEY ("papi_attempt_id") REFERENCES "public"."papi_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papi_attempts" ADD CONSTRAINT "papi_attempts_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papi_attempts" ADD CONSTRAINT "papi_attempts_papi_form_version_id_papi_form_versions_id_fk" FOREIGN KEY ("papi_form_version_id") REFERENCES "public"."papi_form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papi_factor_scores" ADD CONSTRAINT "papi_factor_scores_papi_result_id_papi_results_id_fk" FOREIGN KEY ("papi_result_id") REFERENCES "public"."papi_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papi_factor_scores" ADD CONSTRAINT "papi_factor_scores_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papi_item_versions" ADD CONSTRAINT "papi_item_versions_papi_form_version_id_papi_form_versions_id_fk" FOREIGN KEY ("papi_form_version_id") REFERENCES "public"."papi_form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papi_responses" ADD CONSTRAINT "papi_responses_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papi_responses" ADD CONSTRAINT "papi_responses_papi_attempt_id_papi_attempts_id_fk" FOREIGN KEY ("papi_attempt_id") REFERENCES "public"."papi_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papi_results" ADD CONSTRAINT "papi_results_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papi_results" ADD CONSTRAINT "papi_results_papi_attempt_id_papi_attempts_id_fk" FOREIGN KEY ("papi_attempt_id") REFERENCES "public"."papi_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papi_results" ADD CONSTRAINT "papi_results_papi_form_version_id_papi_form_versions_id_fk" FOREIGN KEY ("papi_form_version_id") REFERENCES "public"."papi_form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papi_results" ADD CONSTRAINT "papi_results_superseded_by_id_papi_results_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."papi_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papi_results" ADD CONSTRAINT "papi_results_calculated_by_users_id_fk" FOREIGN KEY ("calculated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papi_results" ADD CONSTRAINT "papi_results_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "papi_segment_attempt_ix" ON "papi_attempt_segments" USING btree ("papi_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "papi_attempt_session_ux" ON "papi_attempts" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "papi_factor_score_result_ux" ON "papi_factor_scores" USING btree ("papi_result_id","factor_code");--> statement-breakpoint
CREATE INDEX "papi_factor_score_session_ix" ON "papi_factor_scores" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "papi_form_code_version_ux" ON "papi_form_versions" USING btree ("form_code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "papi_item_form_number_ux" ON "papi_item_versions" USING btree ("papi_form_version_id","item_number");--> statement-breakpoint
CREATE UNIQUE INDEX "papi_response_attempt_item_ux" ON "papi_responses" USING btree ("papi_attempt_id","item_number");--> statement-breakpoint
CREATE INDEX "papi_response_session_ix" ON "papi_responses" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "papi_result_session_ix" ON "papi_results" USING btree ("session_id");--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_papi_form_version_id_papi_form_versions_id_fk" FOREIGN KEY ("papi_form_version_id") REFERENCES "public"."papi_form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_papi_skipped_by_users_id_fk" FOREIGN KEY ("papi_skipped_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;