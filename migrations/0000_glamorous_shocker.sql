CREATE TYPE "public"."application_stage" AS ENUM('lead', 'applied', 'screen', 'interview', 'offer', 'closed_won', 'closed_lost');--> statement-breakpoint
CREATE TYPE "public"."email_allowlist_kind" AS ENUM('domain', 'address');--> statement-breakpoint
CREATE TYPE "public"."email_provider" AS ENUM('gmail');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"recruiter_id" integer,
	"primary_contact_id" integer,
	"title" text NOT NULL,
	"source_url" text,
	"location" text,
	"salary_note" text,
	"stage" "application_stage" DEFAULT 'lead' NOT NULL,
	"position_in_stage" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"applied_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"careers_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"linkedin_url" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_allowlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "email_allowlist_kind" NOT NULL,
	"value" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" "email_provider" DEFAULT 'gmail' NOT NULL,
	"provider_message_id" text NOT NULL,
	"thread_id" text,
	"sender" text NOT NULL,
	"subject" text,
	"sent_at" timestamp with time zone NOT NULL,
	"application_id" integer,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruiters" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"agency" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"role" text,
	"start_date" date,
	"end_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_recruiter_id_recruiters_id_fk" FOREIGN KEY ("recruiter_id") REFERENCES "public"."recruiters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_primary_contact_id_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiters" ADD CONSTRAINT "recruiters_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_stage_idx" ON "applications" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "applications_stage_position_idx" ON "applications" USING btree ("stage","position_in_stage");--> statement-breakpoint
CREATE INDEX "applications_company_idx" ON "applications" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_name_idx" ON "companies" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "email_allowlist_kind_value_idx" ON "email_allowlist" USING btree ("kind","value");--> statement-breakpoint
CREATE UNIQUE INDEX "email_events_provider_msg_idx" ON "email_events" USING btree ("provider","provider_message_id");--> statement-breakpoint
CREATE INDEX "email_events_thread_idx" ON "email_events" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "email_events_application_idx" ON "email_events" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "email_events_sent_at_idx" ON "email_events" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "relationships_contact_idx" ON "relationships" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "relationships_company_idx" ON "relationships" USING btree ("company_id");