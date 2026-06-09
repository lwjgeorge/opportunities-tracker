import { z } from "zod";

import { emailExtractionSchema } from "../types";

/**
 * Shape of a golden fixture under `src/lib/llm/eval/fixtures/*.json`.
 * Each fixture is one (input, expected-output) pair authored by hand. The
 * eval runner compares the live extractor's output to `expected`.
 *
 * Two input modes are supported, mirroring {@link LlmExtractor}'s two
 * methods:
 *
 *   - email: { sender, subject, bodyText, sentAt } → extractFromEmail
 *   - free-text: { text, capturedAt } → extractFromFreeText
 *
 * Dates are serialised as ISO strings in JSON and reified to Date instances
 * in the runner — JSON has no Date type. The `expected.dates[].iso` field is
 * already string-typed in the contract so no reification is needed there.
 */
export const fixtureEmailInputSchema = z.object({
  sender: z.string(),
  subject: z.string().nullable(),
  bodyText: z.string().nullable(),
  sentAt: z.string(), // ISO 8601
});

export const fixtureFreeTextInputSchema = z.object({
  text: z.string().min(1),
  capturedAt: z.string(), // ISO 8601
});

/**
 * Discriminated by which key is present. Zod's `z.union` short-circuits on
 * the first matching schema, so put the more specific one first; both are
 * specific enough here that order doesn't matter, but email is the dominant
 * fixture type so we keep it first to minimise parse work on hot paths.
 */
export const fixtureInputSchema = z.union([
  fixtureEmailInputSchema,
  fixtureFreeTextInputSchema,
]);

export const fixtureSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  input: fixtureInputSchema,
  expected: emailExtractionSchema,
});

export type FixtureEmailInput = z.infer<typeof fixtureEmailInputSchema>;
export type FixtureFreeTextInput = z.infer<typeof fixtureFreeTextInputSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;

/**
 * Type guard so the runner can branch on which extractor method to invoke
 * without trusting unsafe casts.
 */
export function isFreeTextInput(
  input: Fixture["input"],
): input is FixtureFreeTextInput {
  return "text" in input;
}
