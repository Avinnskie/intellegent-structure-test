CREATE TYPE "public"."reentry_policy" AS ENUM('single', 'multi');--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD COLUMN "reentry_policy" "reentry_policy" DEFAULT 'single' NOT NULL;