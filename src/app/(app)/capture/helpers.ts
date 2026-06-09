/**
 * Pure matching/normalisation helpers for the /capture review surface.
 *
 * Extracted from the server action so they can be unit-tested without a DB.
 * The actions in `./actions.ts` wrap these around `db.select(...)` calls; the
 * helpers themselves know nothing about Drizzle.
 *
 * Matching policy mirrors `src/app/(app)/relationships/candidates/actions.ts`:
 *   - companies: case-insensitive on `name` (trimmed)
 *   - contacts: case-insensitive on `email` first, then on `name`
 *
 * Keep these two policies in sync. If you tighten one, tighten the other.
 */

import type { Company, Contact } from "@/db/schema";

/**
 * Lower-case + collapse internal whitespace + trim. Idempotent. Used as the
 * comparison key for company name lookups. We do NOT mutate the user-supplied
 * casing on write — only on lookup — so "Stripe" stays "Stripe" in the row.
 */
export function normalizeCompanyName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Same shape as {@link normalizeCompanyName}. Kept as a separate function to
 * give us a single place to evolve email normalisation later (e.g. stripping
 * `+suffix` aliases) without touching company logic.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Find an existing company by case-insensitive name. Returns the candidate
 * row, or null if no match. Callers pass in the candidate list themselves so
 * we can stay DB-agnostic and tests can supply fixtures.
 */
export function matchExistingCompany(
  name: string,
  candidates: ReadonlyArray<Pick<Company, "id" | "name">>,
): Pick<Company, "id" | "name"> | null {
  const target = normalizeCompanyName(name);
  if (target.length === 0) return null;
  for (const c of candidates) {
    if (normalizeCompanyName(c.name) === target) return c;
  }
  return null;
}

/**
 * Find an existing contact by email first (case-insensitive), then by name.
 * Returns the candidate row, or null if no match.
 *
 * Why email-first: a contact's display name can drift ("Aisha Khan" vs
 * "Aisha K."), but their work email is usually a stable key. If the input
 * has no email, we fall back to case-insensitive exact name match — that's
 * lossier but matches what the candidate-approval flow already does.
 */
export function matchExistingContact(
  input: { name: string; email?: string | null },
  candidates: ReadonlyArray<Pick<Contact, "id" | "name" | "email">>,
): Pick<Contact, "id" | "name" | "email"> | null {
  const email = input.email ? normalizeEmail(input.email) : null;
  if (email && email.length > 0) {
    for (const c of candidates) {
      if (c.email && normalizeEmail(c.email) === email) return c;
    }
  }
  const name = normalizeCompanyName(input.name); // same normalisation shape
  if (name.length === 0) return null;
  for (const c of candidates) {
    if (normalizeCompanyName(c.name) === name) return c;
  }
  return null;
}
