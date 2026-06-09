"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { companies, contacts, relationships } from "@/db/schema";
import { createClaudeLlmExtractor } from "@/lib/llm/providers/claude";
import {
  type EmailExtraction,
  emailExtractionSchema,
} from "@/lib/llm/types";

import {
  matchExistingCompany,
  matchExistingContact,
  normalizeCompanyName,
  normalizeEmail,
} from "./helpers";

const REVALIDATE_PATHS = [
  "/graph",
  "/companies",
  "/contacts",
  "/capture",
] as const;

/**
 * Discriminated-union return shapes. Server actions returning `Result<T>`
 * keep the client free of try/catch noise; the review UI just switches on
 * `ok`.
 */
/** Per-entity flags surfaced to the review UI; avoids a second round-trip. */
export type ExistingFlags = {
  companies: Record<string, boolean>; // key = normalised name
  contacts: Record<string, boolean>; // key = normalised email-or-name
};

export type PersistCounts = {
  companiesCreated: number;
  contactsCreated: number;
  relationshipsCreated: number;
};

export type ExtractResult =
  | { ok: true; extraction: EmailExtraction; existing: ExistingFlags }
  | { ok: false; error: string };

export type PersistResult =
  | { ok: true; counts: PersistCounts }
  | { ok: false; error: string };

const MAX_INPUT_CHARS = 4000; // generous — a verbose paragraph ≈ 1k chars

/**
 * Key for the `existing.contacts` map. Prefers email; falls back to a
 * `name:<normalised>` synthetic so name-only contacts still get a stable
 * lookup key.
 */
function contactKey(input: { name: string; email?: string | null }): string {
  if (input.email && input.email.trim().length > 0) {
    return `email:${normalizeEmail(input.email)}`;
  }
  return `name:${normalizeCompanyName(input.name)}`;
}

/**
 * Phase 1: run the LLM extractor against the user's note and decorate every
 * detected entity with an existence flag pulled from the current DB state.
 * Does NOT persist anything — that's `persistCapture`.
 */
export async function extractCapture(rawText: string): Promise<ExtractResult> {
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (text.length === 0) {
    return { ok: false, error: "Type something before extracting." };
  }
  if (text.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: `Note is too long (${text.length} chars). Trim it under ${MAX_INPUT_CHARS}.`,
    };
  }

  let extraction: EmailExtraction;
  try {
    const extractor = createClaudeLlmExtractor();
    extraction = await extractor.extractFromFreeText({
      text,
      capturedAt: new Date(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Extraction failed: ${message}` };
  }

  // Pull the current candidate sets in two small queries. We grab id + name +
  // (for contacts) email — everything we need to render the badge — and
  // nothing else.
  let existingCompanies: { id: number; name: string }[];
  let existingContacts: { id: number; name: string; email: string | null }[];
  try {
    [existingCompanies, existingContacts] = await Promise.all([
      db.select({ id: companies.id, name: companies.name }).from(companies),
      db
        .select({ id: contacts.id, name: contacts.name, email: contacts.email })
        .from(contacts),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Database lookup failed: ${message}` };
  }

  const companyFlags: Record<string, boolean> = {};
  for (const c of extraction.companies) {
    companyFlags[normalizeCompanyName(c.name)] =
      matchExistingCompany(c.name, existingCompanies) !== null;
  }

  const contactFlags: Record<string, boolean> = {};
  for (const p of extraction.people) {
    contactFlags[contactKey(p)] =
      matchExistingContact(
        { name: p.name, email: p.email ?? null },
        existingContacts,
      ) !== null;
  }

  return {
    ok: true,
    extraction,
    existing: { companies: companyFlags, contacts: contactFlags },
  };
}

/**
 * Phase 2: persist a confirmed extraction. Wraps every write in a single
 * Drizzle transaction so a partial failure doesn't leave half-linked rows.
 *
 * Inputs come from the client and are validated against
 * {@link emailExtractionSchema} before we trust them — never persist
 * un-validated user-controlled JSON.
 */
export async function persistCapture(
  extractionJson: unknown,
): Promise<PersistResult> {
  const parsed = emailExtractionSchema.safeParse(extractionJson);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid extraction payload: ${JSON.stringify(parsed.error.issues)}`,
    };
  }
  const extraction = parsed.data;

  let companiesCreated = 0;
  let contactsCreated = 0;
  let relationshipsCreated = 0;

  try {
    await db.transaction(async (tx) => {
      // --- Upsert companies ---------------------------------------------
      const companyRows = await tx
        .select({ id: companies.id, name: companies.name })
        .from(companies);
      const companyByKey = new Map<string, number>();
      for (const c of companyRows) {
        companyByKey.set(normalizeCompanyName(c.name), c.id);
      }
      for (const c of extraction.companies) {
        const key = normalizeCompanyName(c.name);
        if (key.length === 0) continue;
        if (companyByKey.has(key)) continue;
        const inserted = await tx
          .insert(companies)
          .values({
            name: c.name.trim(),
            website: c.domain ? `https://${c.domain}` : null,
          })
          .returning({ id: companies.id });
        companyByKey.set(key, inserted[0].id);
        companiesCreated++;
      }

      // --- Upsert contacts ----------------------------------------------
      const contactRows = await tx
        .select({
          id: contacts.id,
          name: contacts.name,
          email: contacts.email,
        })
        .from(contacts);

      // Two lookup maps so we can match by email or name in O(1).
      const contactByEmail = new Map<string, number>();
      const contactByName = new Map<string, number>();
      for (const row of contactRows) {
        if (row.email) {
          contactByEmail.set(normalizeEmail(row.email), row.id);
        }
        contactByName.set(normalizeCompanyName(row.name), row.id);
      }

      // Returns the contact id (existing or newly inserted) for a person.
      const resolveContactId = async (person: {
        name: string;
        email?: string;
      }): Promise<number> => {
        if (person.email) {
          const k = normalizeEmail(person.email);
          const hit = contactByEmail.get(k);
          if (hit !== undefined) return hit;
        }
        const nameKey = normalizeCompanyName(person.name);
        const byName = contactByName.get(nameKey);
        if (byName !== undefined) return byName;

        const inserted = await tx
          .insert(contacts)
          .values({
            name: person.name.trim(),
            email: person.email ? normalizeEmail(person.email) : null,
          })
          .returning({ id: contacts.id });
        const newId = inserted[0].id;
        if (person.email) {
          contactByEmail.set(normalizeEmail(person.email), newId);
        }
        contactByName.set(nameKey, newId);
        contactsCreated++;
        return newId;
      };

      for (const p of extraction.people) {
        await resolveContactId({ name: p.name, email: p.email });
      }

      // --- Insert relationships -----------------------------------------
      // We only emit (contact, company) edges; the LLM's `relation` field is
      // captured via the `role` text column when it's "works_at" + a role
      // string. The richer `relationships` table doesn't have a relation
      // enum, so we stash the LLM relation kind in `notes` so the audit
      // trail survives. (relationship_candidates is the place for the typed
      // enum; this table is the canonical join.)
      const seen = new Set<string>();
      for (const r of extraction.relationships) {
        if (!r.company) continue; // no company → no edge to insert
        const companyId = companyByKey.get(
          normalizeCompanyName(r.company.name),
        );
        if (companyId === undefined) continue;
        const contactId = await resolveContactId({
          name: r.contact.name,
          email: r.contact.email,
        });
        // Soft-dedupe inside this single capture: avoid emitting two
        // identical (contact, company, role) edges if the LLM repeated them.
        const dedupeKey = `${contactId}:${companyId}:${r.role ?? ""}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        await tx.insert(relationships).values({
          contactId,
          companyId,
          role: r.role ?? null,
          notes: `via capture: ${r.relation}`,
        });
        relationshipsCreated++;
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Persist failed: ${message}` };
  }

  for (const p of REVALIDATE_PATHS) {
    revalidatePath(p);
  }

  return {
    ok: true,
    counts: { companiesCreated, contactsCreated, relationshipsCreated },
  };
}
