import { z } from "zod";

/**
 * Validation + normalisation for email allowlist entries.
 *
 * Kept as pure functions (no DB import) so it is unit-testable in isolation
 * and reusable from server actions, cron routes, and future scripts.
 *
 * Both `domain` and `address` are lower-cased on parse; the DB unique index
 * is case-sensitive so consistent normalisation is what keeps duplicates out.
 */

// RFC 1035 hostname-ish. Two-or-more labels, each 1-63 chars of
// [a-z0-9-], not starting/ending with a hyphen, joined by dots, TLD must be
// at least 2 alphabetic chars. Practical, not exhaustive.
const DOMAIN_REGEX =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

// RFC 5321-ish: local-part + @ + domain. Local part allows the common
// printable set (letters, digits, and `.!#$%&'*+/=?^_\`{|}~-`). Avoids the
// quoted-local-part edge case nobody actually uses for allowlisting.
const ADDRESS_REGEX =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export const allowlistKindSchema = z.enum(["domain", "address"]);
export type AllowlistKind = z.infer<typeof allowlistKindSchema>;

const trimmedLower = z
  .string()
  .trim()
  .transform((s) => s.toLowerCase());

const domainValueSchema = trimmedLower.refine(
  (s) => DOMAIN_REGEX.test(s),
  "Not a valid domain (e.g. example.com)",
);

const addressValueSchema = trimmedLower.refine(
  (s) => ADDRESS_REGEX.test(s),
  "Not a valid email address (e.g. recruiter@example.com)",
);

const notesSchema = z
  .string()
  .trim()
  .max(500, "Notes capped at 500 characters")
  .optional()
  .transform((s) => (s && s.length > 0 ? s : null));

/**
 * Discriminated-union schema for an allowlist entry. The shape returned on
 * success is exactly what we insert into `email_allowlist`.
 */
export const allowlistEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("domain"),
    value: domainValueSchema,
    notes: notesSchema,
  }),
  z.object({
    kind: z.literal("address"),
    value: addressValueSchema,
    notes: notesSchema,
  }),
]);

export type AllowlistEntryInput = z.infer<typeof allowlistEntrySchema>;

export type ParseResult =
  | { ok: true; value: AllowlistEntryInput }
  | { ok: false; error: string };

/**
 * Validate + normalise a raw form payload. Returns a `ParseResult` instead
 * of throwing — server actions want a flat error to surface to the user, and
 * we don't want to leak the full ZodError tree into the UI.
 */
export function parseAllowlistEntry(input: {
  kind: unknown;
  value: unknown;
  notes?: unknown;
}): ParseResult {
  const parsed = allowlistEntrySchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first?.message ?? "Invalid allowlist entry",
    };
  }
  return { ok: true, value: parsed.data };
}
