import { describe, expect, it } from "vitest";

import {
  RELATION_VALUES,
  STAGE_SIGNAL_VALUES,
  emailExtractionSchema,
  extractedCompanySchema,
  extractedDateSchema,
  extractedPersonSchema,
  relationshipCandidateSchema,
  stageSignalSchema,
} from "./types";

// Smoke test for the public surface of the llm types module. If any of these
// re-exports get renamed or removed, the cron route and the candidate-review
// UI break — so this is a guard, not just a "did the file load" probe.

describe("llm/types public exports", () => {
  it("exports the relation + stage value lists", () => {
    expect(RELATION_VALUES).toContain("works_at");
    expect(RELATION_VALUES).toContain("colleague_of");
    expect(STAGE_SIGNAL_VALUES).toContain("interview");
    expect(STAGE_SIGNAL_VALUES).toContain("closed_won");
  });

  it("exports every leaf zod schema callers depend on", () => {
    expect(typeof extractedPersonSchema.parse).toBe("function");
    expect(typeof extractedCompanySchema.parse).toBe("function");
    expect(typeof extractedDateSchema.parse).toBe("function");
    expect(typeof stageSignalSchema.parse).toBe("function");
    expect(typeof relationshipCandidateSchema.parse).toBe("function");
    expect(typeof emailExtractionSchema.parse).toBe("function");
  });

  it("stage enum mirrors application_stage", () => {
    expect([...STAGE_SIGNAL_VALUES]).toEqual([
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
