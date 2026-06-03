CREATE TABLE "company_scrapes" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"url" text NOT NULL,
	"final_url" text,
	"http_status" integer NOT NULL,
	"html" text,
	"extracted" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "company_scrapes" ADD CONSTRAINT "company_scrapes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_scrapes_company_fetched_idx" ON "company_scrapes" USING btree ("company_id","fetched_at" DESC NULLS LAST);