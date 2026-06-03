# LLM eval fixtures

Golden test cases for the `LlmExtractor.extractFromEmail` interface. Each file is one fixture in the shape:

```json
{
  "name": "kebab-case-id",
  "description": "what this fixture exercises",
  "input": { "sender": "...", "subject": "...", "bodyText": "...", "sentAt": "..." },
  "expected": { /* an EmailExtraction shape */ }
}
```

Five fixtures ship by default. They cover the high-frequency email shapes a job-search inbox sees:

| File | Scenario | Key signal |
|---|---|---|
| `01-recruiter-cold-outreach.json` | Agency recruiter cold outreach | `recruited_for` relationship + `lead` stage |
| `02-interview-scheduling.json` | Hiring manager schedules a technical screen | `screen` stage + dated event |
| `03-offer-extended.json` | Formal offer with comp details | `offer` stage + multiple dates |
| `04-rejection.json` | Polite rejection | `closed_lost` stage |
| `05-warm-intro.json` | Friend → hiring manager warm intro | `introduced_by` + `works_at` relationships |

## How to run the eval

```bash
ANTHROPIC_API_KEY=sk-... pnpm eval:llm
```

The runner (`src/lib/llm/eval/run.ts`, owned by the eval-harness commit):
1. Loads every `*.json` in this directory.
2. Calls the configured `LlmExtractor` (defaults to `ClaudeLlmExtractor`) on each `input`.
3. Compares actual vs `expected` along several dimensions:
   - **Strict-equal**: `stageSignal.toStage`, relation kinds, company names (case-insensitive).
   - **Set-overlap**: people, companies, dates, relationships use a Jaccard-ish overlap score.
   - **Semantic**: `summary` is judged by a second LLM call asking "does the actual summary convey the same meaning as the expected, on a 0-5 scale?". This is where "Claude grading Claude" earns its keep — a deterministic string match doesn't survive paraphrase.
4. Prints a per-fixture pass/fail + an overall score.

## Authoring new fixtures

- Keep emails realistic. The model's calibration drifts on contrived prose.
- The `expected` block represents what a careful human reading would extract, not a hypothetical lossless answer. If reasonable readers disagree, the fixture is too ambiguous — split it or rewrite.
- `confidence` values in `expected` are guidance for the eval (we allow some slack), not strict requirements.
- Stage names must match the schema enum (`lead | applied | screen | interview | offer | closed_won | closed_lost`).
