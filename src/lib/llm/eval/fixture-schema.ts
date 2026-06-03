import { z } from "zod";

import { emailExtractionSchema } from "../types";

/**
 * Shape of a golden fixture under `src/lib/llm/eval/fixtures/*.json`.
 * Each fixture is one (input, expected-output) pair authored by hand. The
 * eval runner compares the live extractor's output to `expected`.
 *
 * `input.sentAt` is serialised as an ISO string in JSON and reified to a
 * Date in the runner — JSON has no Date type. Same for `expected.dates[].iso`
 * which is already ISO-string-typed in the contract.
 */
export const fixtureInputSchema = z.object({
  sender: z.string(),
  subject: z.string().nullable(),
  bodyText: z.string().nullable(),
  sentAt: z.string(), // ISO 8601
});

export const fixtureSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  input: fixtureInputSchema,
  expected: emailExtractionSchema,
});

export type Fixture = z.infer<typeof fixtureSchema>;
