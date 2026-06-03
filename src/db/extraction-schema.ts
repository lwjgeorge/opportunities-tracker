import {
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * LLM extraction layer.
 *
 * Lives in its own schema file so the extraction pipeline can iterate without
 * touching the canonical `schema.ts`. Drizzle-kit unions all schema files in
 * `drizzle.config.ts`; this file MUST be added to that glob before
 * `pnpm db:generate` will emit a migration.
 *
 * Two tables here:
 *  - `extraction_runs`     — one row per attempted extraction (audit / retry).
 *  - `relationship_candidates` — pending contact↔company links awaiting review.
 *  - `stage_signal_candidates` — pending application-stage transitions awaiting review.
 *
 * The two candidate tables are intentionally separate: their relations and
 * review flows diverge enough (stage signals touch `applications.stage`,
 * relationship candidates touch `contacts`/`companies`/`relationships`) that
 * sharing a row would force a sparse, mostly-null table with branching code
 * paths in every reader. Two narrow tables is the cheaper read.
 */

/** Source-table discriminator. Both candidate tables and `extraction_runs` use it. */
export const extractionSource = pgEnum("extraction_source", [
  "email_event",
  "company_scrape",
]);

/** Outcome of one `extractFromEmail` call. */
export const extractionRunStatus = pgEnum("extraction_run_status", [
  "success",
  "failure",
]);

/**
 * Kind of contact→company link the LLM flagged. Mirrors `RELATION_VALUES`
 * in `src/lib/llm/types.ts`; keep in sync.
 */
export const relationshipCandidateRelation = pgEnum(
  "relationship_candidate_relation",
  ["works_at", "recruited_for", "introduced_by", "colleague_of"],
);

/** Review lifecycle for any LLM candidate row. */
export const candidateStatus = pgEnum("candidate_status", [
  "pending",
  "approved",
  "rejected",
  "edited",
]);

/**
 * Same enum values as `application_stage` in `schema.ts`. We re-declare here
 * to avoid the cross-file enum import (drizzle-kit treats each pg enum as
 * owned by exactly one schema file and will otherwise duplicate the CREATE
 * TYPE statement). The DB-level type is name-distinct so they never collide.
 */
export const stageSignalCandidateStage = pgEnum("stage_signal_candidate_stage", [
  "lead",
  "applied",
  "screen",
  "interview",
  "offer",
  "closed_won",
  "closed_lost",
]);

/**
 * One row per attempted extraction. Append-only audit log. The cron
 * picks up sources where no `success` row exists yet, so a failure row
 * does NOT block a future retry — that's deliberate: the cron can be
 * rerun manually after a transient API failure.
 */
export const extractionRuns = pgTable(
  "extraction_runs",
  {
    id: serial("id").primaryKey(),
    source: extractionSource("source").notNull(),
    /** FK target depends on `source`. Not a hard FK because of the union. */
    sourceId: integer("source_id").notNull(),
    /** Stable model identifier, e.g. `claude-sonnet-4-6`. */
    modelName: text("model_name").notNull(),
    status: extractionRunStatus("status").notNull(),
    /** Populated only when status='failure'. */
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    // Primary access pattern: "has source X been successfully extracted?"
    index("extraction_runs_source_idx").on(t.source, t.sourceId, t.status),
  ],
);

/**
 * One row per contact↔company link the LLM proposed. Reviewer approves,
 * rejects, or edits in the UI; on approve the server action upserts
 * `contacts`/`companies`/`relationships` accordingly.
 */
export const relationshipCandidates = pgTable(
  "relationship_candidates",
  {
    id: serial("id").primaryKey(),
    source: extractionSource("source").notNull(),
    sourceId: integer("source_id").notNull(),
    relation: relationshipCandidateRelation("relation").notNull(),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email"),
    companyName: text("company_name"),
    role: text("role"),
    /** 0..1 confidence from the model. */
    confidence: real("confidence").notNull(),
    /** Verbatim snippet from the source that justifies the inference. */
    sourceQuote: text("source_quote").notNull(),
    status: candidateStatus("status").notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /**
     * Auth session that approved/rejected this row. Free text rather than
     * an FK because Auth.js's session table is virtual (JWT strategy).
     */
    decidedBySessionId: text("decided_by_session_id"),
  },
  (t) => [
    // Review queue ordering: pending, high confidence first.
    index("relationship_candidates_status_confidence_idx").on(
      t.status,
      t.confidence,
    ),
    index("relationship_candidates_source_idx").on(t.source, t.sourceId),
  ],
);

/**
 * One row per stage-transition signal the LLM proposed. Kept separate from
 * `relationship_candidates` because the review flow writes to
 * `applications.stage`, not to `relationships`, and shares no useful columns
 * beyond the audit metadata.
 */
export const stageSignalCandidates = pgTable(
  "stage_signal_candidates",
  {
    id: serial("id").primaryKey(),
    source: extractionSource("source").notNull(),
    sourceId: integer("source_id").notNull(),
    toStage: stageSignalCandidateStage("to_stage").notNull(),
    confidence: real("confidence").notNull(),
    reason: text("reason").notNull(),
    status: candidateStatus("status").notNull().default("pending"),
    /** Application this signal eventually applies to; set on approval. */
    applicationId: integer("application_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBySessionId: text("decided_by_session_id"),
  },
  (t) => [
    index("stage_signal_candidates_status_confidence_idx").on(
      t.status,
      t.confidence,
    ),
    index("stage_signal_candidates_source_idx").on(t.source, t.sourceId),
  ],
);

export type ExtractionRun = typeof extractionRuns.$inferSelect;
export type NewExtractionRun = typeof extractionRuns.$inferInsert;
export type RelationshipCandidateRow = typeof relationshipCandidates.$inferSelect;
export type NewRelationshipCandidateRow = typeof relationshipCandidates.$inferInsert;
export type StageSignalCandidateRow = typeof stageSignalCandidates.$inferSelect;
export type NewStageSignalCandidateRow = typeof stageSignalCandidates.$inferInsert;
