import { z } from "zod";

/**
 * Provider-agnostic LLM extraction contract.
 *
 * Downstream (the run-extraction cron, the candidate-review UI) speaks only
 * to {@link LlmExtractor} and the shapes below. Anything provider-specific —
 * tool-use payloads, caching, retries — lives in the concrete implementation
 * under `src/lib/llm/providers/`.
 *
 * The zod schemas at the bottom of this file are the runtime authority for
 * what counts as a valid {@link EmailExtraction}. Providers MUST validate
 * their parsed output against {@link emailExtractionSchema} before returning
 * it; the cron will not catch model drift otherwise.
 */

/**
 * Application-pipeline stage. Mirrors the `application_stage` pg enum in
 * `src/db/schema.ts`; keep in sync.
 */
export const STAGE_SIGNAL_VALUES = [
  "lead",
  "applied",
  "screen",
  "interview",
  "offer",
  "closed_won",
  "closed_lost",
] as const;

export type StageValue = (typeof STAGE_SIGNAL_VALUES)[number];

/**
 * Kinds of contact-to-company relationships the LLM is asked to flag.
 * Stored on `relationship_candidates.relation` in the DB.
 */
export const RELATION_VALUES = [
  "works_at",
  "recruited_for",
  "introduced_by",
  "colleague_of",
] as const;

export type RelationValue = (typeof RELATION_VALUES)[number];

// --- Input shape ----------------------------------------------------------

export type EmailExtractionInput = {
  sender: string;
  subject: string | null;
  /**
   * Plain-text body. Null when only metadata is available (current Gmail
   * polling fetches metadata-only). Providers MUST tolerate null and
   * extract whatever they can from sender + subject alone.
   */
  bodyText: string | null;
  sentAt: Date;
};

// --- Output shapes (zod-first; TS types are inferred) ---------------------

export const extractedPersonSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  role: z.string().optional(),
  company: z.string().optional(),
});

export const extractedCompanySchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
});

export const extractedDateSchema = z.object({
  /** ISO 8601 timestamp. */
  iso: z.string().min(1),
  /** ~10 words of surrounding context, for human review. */
  context: z.string(),
});

export const stageSignalSchema = z.object({
  toStage: z.enum(STAGE_SIGNAL_VALUES),
  confidence: z.number().min(0).max(1),
  /** One-sentence justification for the stage change. */
  reason: z.string(),
});

export const relationshipCandidateSchema = z.object({
  contact: z.object({
    name: z.string().min(1),
    email: z.string().optional(),
  }),
  company: z
    .object({
      name: z.string().min(1),
    })
    .optional(),
  role: z.string().optional(),
  relation: z.enum(RELATION_VALUES),
  confidence: z.number().min(0).max(1),
  /** Verbatim snippet from the email; used as audit context in the UI. */
  sourceQuote: z.string(),
});

export const emailExtractionSchema = z.object({
  people: z.array(extractedPersonSchema),
  companies: z.array(extractedCompanySchema),
  dates: z.array(extractedDateSchema),
  stageSignal: stageSignalSchema.optional(),
  relationships: z.array(relationshipCandidateSchema),
  /** One-sentence summary of the email's meaning for the job search. */
  summary: z.string(),
});

export type ExtractedPerson = z.infer<typeof extractedPersonSchema>;
export type ExtractedCompany = z.infer<typeof extractedCompanySchema>;
export type ExtractedDate = z.infer<typeof extractedDateSchema>;
export type StageSignal = z.infer<typeof stageSignalSchema>;
export type RelationshipCandidate = z.infer<typeof relationshipCandidateSchema>;
export type EmailExtraction = z.infer<typeof emailExtractionSchema>;

// --- Extractor interface --------------------------------------------------

export interface LlmExtractor {
  /**
   * Stable identifier used as `extraction_runs.model_name`. Surfaces to the
   * UI and to debugging dashboards, so prefer a short kebab-case string
   * (e.g. `"claude-sonnet-4-6"`).
   */
  readonly name: string;

  /**
   * Extracts structured signals from one email. Implementations MUST:
   *   - tolerate `bodyText === null` (produce a leaner result, never throw)
   *   - validate their parsed output against {@link emailExtractionSchema}
   *   - throw a descriptive Error on protocol failure (the cron logs to
   *     `extraction_runs` and continues with the next email)
   */
  extractFromEmail(input: EmailExtractionInput): Promise<EmailExtraction>;
}
