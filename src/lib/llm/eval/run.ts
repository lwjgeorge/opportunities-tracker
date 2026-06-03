/**
 * Eval harness entry point. Run via `pnpm eval:llm`.
 *
 * Loads every `*.json` fixture under `src/lib/llm/eval/fixtures/`, calls the
 * configured LlmExtractor on each `input`, scores against `expected`, and
 * prints a per-fixture + overall summary. Exits 0 if average overall score
 * is at or above PASS_THRESHOLD, 1 otherwise.
 *
 * Not part of `pnpm test`. Runs against the live Claude API so it has a
 * cost; CI doesn't invoke it. Run locally when iterating on the extractor
 * prompt or after upgrading Claude's model id.
 */

import { config as loadEnv } from "dotenv";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClaudeLlmExtractor } from "../providers/claude";
import type { LlmExtractor } from "../types";

import { type Fixture, fixtureSchema } from "./fixture-schema";
import { type ScoreBreakdown, scoreExtraction } from "./score";

const PASS_THRESHOLD = 0.7; // average overall score must clear this to exit 0

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

async function loadFixtures(): Promise<Fixture[]> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.join(here, "fixtures");
  const files = await readdir(dir);
  const jsonFiles = files.filter((f) => f.endsWith(".json")).sort();
  const fixtures: Fixture[] = [];
  for (const f of jsonFiles) {
    const raw = await readFile(path.join(dir, f), "utf-8");
    const parsed = fixtureSchema.parse(JSON.parse(raw));
    fixtures.push(parsed);
  }
  return fixtures;
}

function formatPct(n: number): string {
  return (n * 100).toFixed(0).padStart(3, " ") + "%";
}

function formatBreakdown(b: ScoreBreakdown): string {
  return [
    `stage=${formatPct(b.stage)}`,
    `people=${formatPct(b.people)}`,
    `companies=${formatPct(b.companies)}`,
    `relationships=${formatPct(b.relationships)}`,
    `dates=${formatPct(b.dates)}`,
  ].join("  ");
}

export async function runEval(
  extractor: LlmExtractor,
  fixtures: Fixture[],
): Promise<{ overall: number; results: { name: string; score: ScoreBreakdown; summaryActual: string; summaryExpected: string }[] }> {
  const results: {
    name: string;
    score: ScoreBreakdown;
    summaryActual: string;
    summaryExpected: string;
  }[] = [];

  for (const fixture of fixtures) {
    const input = {
      ...fixture.input,
      sentAt: new Date(fixture.input.sentAt),
    };
    const actual = await extractor.extractFromEmail(input);
    const score = scoreExtraction(fixture.expected, actual);
    results.push({
      name: fixture.name,
      score,
      summaryActual: actual.summary,
      summaryExpected: fixture.expected.summary,
    });
  }

  const overall =
    results.reduce((s, r) => s + r.score.overall, 0) / Math.max(results.length, 1);

  return { overall, results };
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. The eval needs a real key to call the Claude API.",
    );
    console.error("Set it in .env.local or export it before running pnpm eval:llm.");
    process.exit(2);
  }

  const fixtures = await loadFixtures();
  if (fixtures.length === 0) {
    console.error("No fixtures found under src/lib/llm/eval/fixtures/");
    process.exit(2);
  }
  console.log(`Loaded ${fixtures.length} fixtures.`);

  const extractor = createClaudeLlmExtractor();
  console.log(`Running against extractor "${extractor.name}".`);
  console.log("");

  const { overall, results } = await runEval(extractor, fixtures);

  for (const r of results) {
    const pass = r.score.overall >= PASS_THRESHOLD ? "PASS" : "FAIL";
    console.log(`[${pass}] ${r.name}  overall=${formatPct(r.score.overall)}`);
    console.log(`       ${formatBreakdown(r.score)}`);
    console.log(`       expected summary: ${r.summaryExpected}`);
    console.log(`       actual summary:   ${r.summaryActual}`);
    console.log("");
  }

  const overallPct = formatPct(overall);
  const thresholdPct = formatPct(PASS_THRESHOLD);
  if (overall >= PASS_THRESHOLD) {
    console.log(`Overall: ${overallPct} >= ${thresholdPct}. PASS.`);
    process.exit(0);
  } else {
    console.log(`Overall: ${overallPct} < ${thresholdPct}. FAIL.`);
    process.exit(1);
  }
}

// Only execute when invoked directly, not when imported by tests.
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/src/lib/llm/eval/run.ts");
if (isDirectInvocation) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
