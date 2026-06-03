import type { EmailExtraction } from "../types";

/**
 * Score one extraction against its expected fixture. Pure function: no IO,
 * no LLM calls. The runner composes these per-dimension scores into an
 * overall pass/fail.
 *
 * Dimensions:
 *  - `stage`: strict equality on `stageSignal.toStage`. Both present or both
 *     absent passes; mismatch fails. Score 1.0 or 0.0.
 *  - `people`: case-insensitive name-token overlap, Jaccard.
 *  - `companies`: case-insensitive name overlap, Jaccard.
 *  - `relationships`: count of (contact-name lowercased, relation) pairs
 *     present in both, normalised by max(expected, actual) length.
 *  - `dates`: count of matching ISO-date *days* (we don't penalise minute
 *     drift; the underlying header may not preserve it).
 *
 * Summary is intentionally NOT scored deterministically. It's surfaced
 * verbatim for visual inspection or later LLM-as-judge.
 */
export type ScoreBreakdown = {
  stage: number;
  people: number;
  companies: number;
  relationships: number;
  dates: number;
  overall: number;
};

export function scoreExtraction(
  expected: EmailExtraction,
  actual: EmailExtraction,
): ScoreBreakdown {
  const stage = scoreStage(expected, actual);
  const people = jaccard(
    expected.people.map((p) => p.name.toLowerCase()),
    actual.people.map((p) => p.name.toLowerCase()),
  );
  const companies = jaccard(
    expected.companies.map((c) => c.name.toLowerCase()),
    actual.companies.map((c) => c.name.toLowerCase()),
  );
  const relationships = scoreRelationships(expected, actual);
  const dates = scoreDates(expected, actual);

  const overall =
    (stage + people + companies + relationships + dates) / 5;

  return { stage, people, companies, relationships, dates, overall };
}

function scoreStage(expected: EmailExtraction, actual: EmailExtraction): number {
  const e = expected.stageSignal?.toStage;
  const a = actual.stageSignal?.toStage;
  if (e === undefined && a === undefined) return 1;
  if (e === a) return 1;
  return 0;
}

function scoreRelationships(
  expected: EmailExtraction,
  actual: EmailExtraction,
): number {
  const expectedKeys = new Set(
    expected.relationships.map(
      (r) => `${r.contact.name.toLowerCase()}|${r.relation}`,
    ),
  );
  const actualKeys = new Set(
    actual.relationships.map(
      (r) => `${r.contact.name.toLowerCase()}|${r.relation}`,
    ),
  );
  if (expectedKeys.size === 0 && actualKeys.size === 0) return 1;
  const intersect = setSize(intersection(expectedKeys, actualKeys));
  const denom = Math.max(expectedKeys.size, actualKeys.size);
  return denom === 0 ? 1 : intersect / denom;
}

function scoreDates(
  expected: EmailExtraction,
  actual: EmailExtraction,
): number {
  const expectedDays = new Set(expected.dates.map((d) => isoDay(d.iso)));
  const actualDays = new Set(actual.dates.map((d) => isoDay(d.iso)));
  if (expectedDays.size === 0 && actualDays.size === 0) return 1;
  const intersect = setSize(intersection(expectedDays, actualDays));
  const denom = Math.max(expectedDays.size, actualDays.size);
  return denom === 0 ? 1 : intersect / denom;
}

function isoDay(iso: string): string {
  // Take the YYYY-MM-DD prefix; ignore minute-level drift.
  return iso.slice(0, 10);
}

export function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  const inter = setSize(intersection(setA, setB));
  const union = setSize(setA) + setSize(setB) - inter;
  return union === 0 ? 1 : inter / union;
}

function intersection<T>(a: Set<T>, b: Set<T>): Set<T> {
  const out = new Set<T>();
  for (const v of a) if (b.has(v)) out.add(v);
  return out;
}

function setSize<T>(s: Set<T>): number {
  return s.size;
}
