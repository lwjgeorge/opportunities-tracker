import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { companies } from "./schema";

/**
 * Raw scrape attempts against a company's `website` (and, later, careers URL).
 *
 * This is intentionally a long-form audit log: one row per fetch, append-only.
 * The orchestrator reconciles the latest row's `extracted` JSON into structured
 * `companies` columns in a later pass (with optional LLM help over `html`).
 *
 * Splitting this out of {@link import("./schema").companies} keeps the
 * scrape pipeline iterating freely without coupling to the main schema file.
 */
export const companyScrapes = pgTable(
  "company_scrapes",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** URL we asked for. */
    url: text("url").notNull(),
    /** URL we actually landed on after redirects. Null if fetch never succeeded. */
    finalUrl: text("final_url"),
    /**
     * HTTP status of the final response. `0` is the sentinel for "never made
     * it that far" (DNS error, robots-blocked, abort, etc.) — see `notes`.
     */
    httpStatus: integer("http_status").notNull(),
    /** Raw HTML body. Null on robots-block, timeout, non-2xx, or oversize. */
    html: text("html"),
    /** Deterministic cheerio extraction. LLM-derived fields are added later. */
    extracted: jsonb("extracted")
      .notNull()
      .default(sql`'{}'::jsonb`),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Free-form, e.g. "blocked by robots", "timeout after 15s", "oversize". */
    notes: text("notes"),
  },
  (t) => [
    // "latest scrape per company" — descending fetched_at within a company.
    index("company_scrapes_company_fetched_idx").on(
      t.companyId,
      t.fetchedAt.desc(),
    ),
  ],
);

export type CompanyScrape = typeof companyScrapes.$inferSelect;
export type NewCompanyScrape = typeof companyScrapes.$inferInsert;
