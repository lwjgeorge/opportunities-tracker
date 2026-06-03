CREATE TYPE "public"."candidate_status" AS ENUM('pending', 'approved', 'rejected', 'edited');--> statement-breakpoint
CREATE TYPE "public"."extraction_run_status" AS ENUM('success', 'failure');--> statement-breakpoint
CREATE TYPE "public"."extraction_source" AS ENUM('email_event', 'company_scrape');--> statement-breakpoint
CREATE TYPE "public"."relationship_candidate_relation" AS ENUM('works_at', 'recruited_for', 'introduced_by', 'colleague_of');--> statement-breakpoint
CREATE TYPE "public"."stage_signal_candidate_stage" AS ENUM('lead', 'applied', 'screen', 'interview', 'offer', 'closed_won', 'closed_lost');--> statement-breakpoint
CREATE TABLE "extraction_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "extraction_source" NOT NULL,
	"source_id" integer NOT NULL,
	"model_name" text NOT NULL,
	"status" "extraction_run_status" NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "relationship_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "extraction_source" NOT NULL,
	"source_id" integer NOT NULL,
	"relation" "relationship_candidate_relation" NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text,
	"company_name" text,
	"role" text,
	"confidence" real NOT NULL,
	"source_quote" text NOT NULL,
	"status" "candidate_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_session_id" text
);
--> statement-breakpoint
CREATE TABLE "stage_signal_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "extraction_source" NOT NULL,
	"source_id" integer NOT NULL,
	"to_stage" "stage_signal_candidate_stage" NOT NULL,
	"confidence" real NOT NULL,
	"reason" text NOT NULL,
	"status" "candidate_status" DEFAULT 'pending' NOT NULL,
	"application_id" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_session_id" text
);
--> statement-breakpoint
CREATE INDEX "extraction_runs_source_idx" ON "extraction_runs" USING btree ("source","source_id","status");--> statement-breakpoint
CREATE INDEX "relationship_candidates_status_confidence_idx" ON "relationship_candidates" USING btree ("status","confidence");--> statement-breakpoint
CREATE INDEX "relationship_candidates_source_idx" ON "relationship_candidates" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "stage_signal_candidates_status_confidence_idx" ON "stage_signal_candidates" USING btree ("status","confidence");--> statement-breakpoint
CREATE INDEX "stage_signal_candidates_source_idx" ON "stage_signal_candidates" USING btree ("source","source_id");