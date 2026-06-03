"use server";

import { and, eq, ilike, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { companies, contacts, relationships } from "@/db/schema";
import {
  candidateStatus,
  relationshipCandidates,
} from "@/db/extraction-schema";
import {
  RELATION_VALUES,
  type RelationValue,
} from "@/lib/llm/types";

const PAGE_PATH = "/relationships/candidates";

/**
 * Shape submitted by the edit form. Fields are optional because the form
 * may legitimately blank out a previously-set value (e.g. the LLM guessed a
 * company and the reviewer wants to clear it).
 */
type ApprovalOverrides = {
  contactName: string;
  contactEmail: string | null;
  companyName: string | null;
  role: string | null;
  relation: RelationValue;
};

function readFormString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isRelationValue(value: unknown): value is RelationValue {
  return typeof value === "string" && (RELATION_VALUES as readonly string[]).includes(value);
}

function readCandidateId(formData: FormData): number {
  const raw = formData.get("id");
  const id = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid candidate id");
  }
  return id;
}

/**
 * Upsert a contact by email (case-insensitive) if email is provided, otherwise
 * by exact-but-case-insensitive name match. Returns the contact id.
 *
 * We don't add a unique index on contacts.email because the schema explicitly
 * allows null and duplicate emails ARE possible in real data (shared aliases).
 * Match-then-insert is the right tradeoff for a single-user app.
 */
async function findOrCreateContact(
  name: string,
  email: string | null,
): Promise<number> {
  if (email) {
    const existing = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(ilike(contacts.email, email))
      .limit(1);
    if (existing.length > 0) return existing[0].id;
  }

  const byName = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(ilike(contacts.name, name))
    .limit(1);
  if (byName.length > 0) return byName[0].id;

  const inserted = await db
    .insert(contacts)
    .values({ name, email })
    .returning({ id: contacts.id });
  return inserted[0].id;
}

/**
 * Upsert a company by name (case-insensitive). Returns the company id.
 */
async function findOrCreateCompany(name: string): Promise<number> {
  const existing = await db
    .select({ id: companies.id })
    .from(companies)
    .where(ilike(companies.name, name))
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  const inserted = await db
    .insert(companies)
    .values({ name })
    .returning({ id: companies.id });
  return inserted[0].id;
}

async function loadCandidate(id: number) {
  const rows = await db
    .select()
    .from(relationshipCandidates)
    .where(eq(relationshipCandidates.id, id))
    .limit(1);
  if (rows.length === 0) {
    throw new Error(`Candidate ${id} not found`);
  }
  return rows[0];
}

async function currentSessionId(): Promise<string | null> {
  // Auth.js JWT strategy doesn't expose a stable session id, so use the user
  // identifier — sub or email — as the auditor key. Falls back to "unknown"
  // when the route is hit in a non-authenticated context (shouldn't happen
  // because middleware gates the (app) group, but defensive).
  const session = await auth();
  return session?.user?.email ?? session?.user?.id ?? null;
}

async function markDecided(
  id: number,
  status: (typeof candidateStatus.enumValues)[number],
  sessionId: string | null,
): Promise<void> {
  await db
    .update(relationshipCandidates)
    .set({
      status,
      decidedAt: new Date(),
      decidedBySessionId: sessionId,
    })
    .where(
      and(
        eq(relationshipCandidates.id, id),
        // Race-guard: only flip pending rows. Re-clicks on already-decided
        // rows become no-ops instead of mutating decidedAt repeatedly.
        eq(relationshipCandidates.status, "pending"),
      ),
    );
}

async function applyApproval(
  candidateId: number,
  overrides: ApprovalOverrides,
  finalStatus: "approved" | "edited",
): Promise<void> {
  const contactId = await findOrCreateContact(
    overrides.contactName,
    overrides.contactEmail,
  );

  // A relationship row requires a company. If the reviewer cleared the
  // company we have nothing to link — just upsert the contact and mark
  // the candidate decided. The audit trail records the relation kind.
  let companyId: number | null = null;
  if (overrides.companyName) {
    companyId = await findOrCreateCompany(overrides.companyName);
  }

  if (companyId !== null) {
    // Don't insert a duplicate (contact, company, role) row — relationships
    // is intentionally non-unique, but the UI shouldn't generate dupes on
    // double-approve. Use a soft-dedupe SELECT first.
    const existing = await db
      .select({ id: relationships.id })
      .from(relationships)
      .where(
        and(
          eq(relationships.contactId, contactId),
          eq(relationships.companyId, companyId),
          overrides.role
            ? eq(relationships.role, overrides.role)
            : sql`${relationships.role} IS NULL`,
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(relationships).values({
        contactId,
        companyId,
        role: overrides.role,
      });
    }
  }

  const sessionId = await currentSessionId();
  await markDecided(candidateId, finalStatus, sessionId);
}

export async function approveCandidate(formData: FormData): Promise<void> {
  const id = readCandidateId(formData);
  const candidate = await loadCandidate(id);
  if (candidate.status !== "pending") {
    revalidatePath(PAGE_PATH);
    return;
  }
  await applyApproval(
    id,
    {
      contactName: candidate.contactName,
      contactEmail: candidate.contactEmail,
      companyName: candidate.companyName,
      role: candidate.role,
      relation: candidate.relation,
    },
    "approved",
  );
  revalidatePath(PAGE_PATH);
}

export async function rejectCandidate(formData: FormData): Promise<void> {
  const id = readCandidateId(formData);
  const sessionId = await currentSessionId();
  await markDecided(id, "rejected", sessionId);
  revalidatePath(PAGE_PATH);
}

export async function editAndApproveCandidate(
  formData: FormData,
): Promise<void> {
  const id = readCandidateId(formData);
  const candidate = await loadCandidate(id);
  if (candidate.status !== "pending") {
    revalidatePath(PAGE_PATH);
    return;
  }

  const contactName = readFormString(formData, "contactName");
  if (!contactName) {
    throw new Error("Contact name is required");
  }

  const relationRaw = formData.get("relation");
  if (!isRelationValue(relationRaw)) {
    throw new Error("Invalid relation");
  }

  await applyApproval(
    id,
    {
      contactName,
      contactEmail: readFormString(formData, "contactEmail"),
      companyName: readFormString(formData, "companyName"),
      role: readFormString(formData, "role"),
      relation: relationRaw,
    },
    "edited",
  );

  revalidatePath(PAGE_PATH);
}
