import { describe, expect, it } from "vitest";

import {
  candidateStatus,
  extractionRunStatus,
  extractionRuns,
  extractionSource,
  relationshipCandidateRelation,
  relationshipCandidates,
  stageSignalCandidateStage,
  stageSignalCandidates,
} from "./extraction-schema";

// Same shape as schema.test.ts: ensure the extraction tables export cleanly
// and the enums match what the cron + UI rely on. If any of these drift,
// `db:generate` would emit a confusing migration — catch it here first.

describe("extraction-schema module", () => {
  it("exports the audit + candidate tables", () => {
    expect(extractionRuns).toBeDefined();
    expect(relationshipCandidates).toBeDefined();
    expect(stageSignalCandidates).toBeDefined();
  });

  it("extraction_source enum lists every source the cron supports", () => {
    expect([...extractionSource.enumValues].sort()).toEqual([
      "company_scrape",
      "email_event",
    ]);
  });

  it("extraction_run_status enum is exactly {success, failure}", () => {
    expect([...extractionRunStatus.enumValues].sort()).toEqual([
      "failure",
      "success",
    ]);
  });

  it("relationship relation enum matches RELATION_VALUES in llm/types.ts", () => {
    expect([...relationshipCandidateRelation.enumValues].sort()).toEqual([
      "colleague_of",
      "introduced_by",
      "recruited_for",
      "works_at",
    ]);
  });

  it("candidate_status covers the full lifecycle", () => {
    expect([...candidateStatus.enumValues].sort()).toEqual([
      "approved",
      "edited",
      "pending",
      "rejected",
    ]);
  });

  it("stage_signal_candidate_stage mirrors application_stage", () => {
    expect(stageSignalCandidateStage.enumValues).toEqual([
      "lead",
      "applied",
      "screen",
      "interview",
      "offer",
      "closed_won",
      "closed_lost",
    ]);
  });
});
