/**
 * UI-side types for the Opportunities Tracker.
 *
 * Designed to mirror the forthcoming Drizzle schema (owned by another agent)
 * so that the wiring step is a near-direct swap: replace these manual types
 * with `InferSelectModel<typeof applications>` etc.
 *
 * Keep these intentionally thin. No methods, no derived fields, no defaults.
 * Schema contract reference: applications, companies, recruiters, contacts,
 * relationships, email_events, email_allowlist.
 */

export const APPLICATION_STAGES = [
  "lead",
  "applied",
  "screen",
  "interview",
  "offer",
  "closed_won",
  "closed_lost",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  headcountBand: string | null;
  hqLocation: string | null;
  lastScrapedAt: Date | null;
}

export interface Application {
  id: string;
  title: string;
  companyId: string;
  stage: ApplicationStage;
  /** Order within a stage column. Lower = higher in the column. */
  positionInStage: number;
  notes: string | null;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Recruiter {
  id: string;
  name: string;
  companyId: string | null;
  email: string | null;
  phone: string | null;
}

export interface Contact {
  id: string;
  name: string;
  companyId: string | null;
  role: string | null;
  email: string | null;
}
