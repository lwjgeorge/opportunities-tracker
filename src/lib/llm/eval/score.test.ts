import { describe, expect, it } from "vitest";

import type { EmailExtraction } from "../types";
import { jaccard, scoreExtraction } from "./score";

const baseExtraction: EmailExtraction = {
  people: [],
  companies: [],
  dates: [],
  relationships: [],
  summary: "",
};

describe("jaccard", () => {
  it("returns 1 when both empty", () => {
    expect(jaccard([], [])).toBe(1);
  });

  it("returns 0 when disjoint", () => {
    expect(jaccard(["a"], ["b"])).toBe(0);
  });

  it("returns 1 when identical", () => {
    expect(jaccard(["a", "b"], ["a", "b"])).toBe(1);
  });

  it("returns 0.5 with one shared element out of two each", () => {
    expect(jaccard(["a", "b"], ["a", "c"])).toBeCloseTo(1 / 3);
  });
});

describe("scoreExtraction", () => {
  it("perfect match scores 1.0 overall", () => {
    const both: EmailExtraction = {
      ...baseExtraction,
      people: [{ name: "Talia" }],
      companies: [{ name: "Linear" }],
      stageSignal: { toStage: "lead", confidence: 0.9, reason: "test" },
      relationships: [
        {
          contact: { name: "Talia" },
          relation: "recruited_for",
          confidence: 0.9,
          sourceQuote: "",
        },
      ],
      dates: [{ iso: "2026-06-01T00:00:00Z", context: "" }],
      summary: "anything",
    };
    const s = scoreExtraction(both, both);
    expect(s.overall).toBe(1);
    expect(s.stage).toBe(1);
    expect(s.people).toBe(1);
    expect(s.companies).toBe(1);
    expect(s.relationships).toBe(1);
    expect(s.dates).toBe(1);
  });

  it("empty fixture and empty extraction scores 1.0", () => {
    const s = scoreExtraction(baseExtraction, baseExtraction);
    expect(s.overall).toBe(1);
  });

  it("stage mismatch zeroes the stage dimension only", () => {
    const expected: EmailExtraction = {
      ...baseExtraction,
      stageSignal: { toStage: "offer", confidence: 0.9, reason: "" },
    };
    const actual: EmailExtraction = {
      ...baseExtraction,
      stageSignal: { toStage: "screen", confidence: 0.9, reason: "" },
    };
    const s = scoreExtraction(expected, actual);
    expect(s.stage).toBe(0);
    expect(s.people).toBe(1);
  });

  it("date dimension ignores minute drift on the same day", () => {
    const expected: EmailExtraction = {
      ...baseExtraction,
      dates: [{ iso: "2026-06-11T14:00:00Z", context: "" }],
    };
    const actual: EmailExtraction = {
      ...baseExtraction,
      dates: [{ iso: "2026-06-11T14:30:00Z", context: "" }],
    };
    expect(scoreExtraction(expected, actual).dates).toBe(1);
  });

  it("relationship dimension matches on contact-name + relation only", () => {
    const expected: EmailExtraction = {
      ...baseExtraction,
      relationships: [
        {
          contact: { name: "Talia" },
          relation: "recruited_for",
          confidence: 0.9,
          sourceQuote: "expected source",
        },
      ],
    };
    const actual: EmailExtraction = {
      ...baseExtraction,
      relationships: [
        {
          contact: { name: "talia" },
          relation: "recruited_for",
          confidence: 0.5,
          sourceQuote: "different source — doesn't matter",
        },
      ],
    };
    expect(scoreExtraction(expected, actual).relationships).toBe(1);
  });

  it("people dimension is case-insensitive on names", () => {
    const expected: EmailExtraction = {
      ...baseExtraction,
      people: [{ name: "MARCUS Chen" }],
    };
    const actual: EmailExtraction = {
      ...baseExtraction,
      people: [{ name: "marcus chen" }],
    };
    expect(scoreExtraction(expected, actual).people).toBe(1);
  });
});
