/**
 * Demo data seeder. Run with `pnpm db:seed`.
 *
 * Reads `DATABASE_URL` from `.env.local` (via `dotenv/config`), then inserts
 * a small but referentially-consistent dataset that exercises every stage
 * column on the kanban. Idempotent in the simplest possible way: if the
 * `Stripe` company row already exists, the whole seed is skipped.
 *
 * The actual fixture data lives in {@link ./seed-data.ts} so tests can
 * exercise it without standing up Postgres.
 */
import { config as loadEnv } from "dotenv";

// Match drizzle.config.ts: prefer .env.local (Next convention), fall back to
// .env. Using "dotenv/config" alone would only read .env and miss the
// connection string the rest of the toolchain expects.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { eq } from "drizzle-orm";

import { db } from "./index";
import {
  applications,
  companies,
  contacts,
  emailAllowlist,
  emailEvents,
  recruiters,
  relationships,
} from "./schema";
import {
  seedApplications,
  seedCompanies,
  seedContacts,
  seedEmailAllowlist,
  seedEmailEvents,
  seedRecruiters,
  seedRelationships,
} from "./seed-data";

async function main(): Promise<void> {
  // Idempotency gate: a `Stripe` row means we've already seeded.
  const existing = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.name, "Stripe"))
    .limit(1);

  if (existing.length > 0) {
    console.log(
      "Seed skipped: companies.name='Stripe' already present. Wipe the DB or delete the row to re-seed.",
    );
    return;
  }

  // --- companies --------------------------------------------------------
  const insertedCompanies = await db
    .insert(companies)
    .values(
      seedCompanies.map((c) => ({
        name: c.name,
        website: c.website,
        careersUrl: c.careersUrl,
        notes: c.notes ?? null,
      })),
    )
    .returning({ id: companies.id });
  const companyIds = insertedCompanies.map((row) => row.id);

  // --- contacts ---------------------------------------------------------
  const insertedContacts = await db
    .insert(contacts)
    .values(
      seedContacts.map((c) => ({
        name: c.name,
        email: c.email,
        notes: c.notes ?? null,
      })),
    )
    .returning({ id: contacts.id });
  const contactIds = insertedContacts.map((row) => row.id);

  // --- recruiters -------------------------------------------------------
  const insertedRecruiters = await db
    .insert(recruiters)
    .values(
      seedRecruiters.map((r) => ({
        contactId: contactIds[r.contactIndex],
        agency: r.agency,
        notes: r.notes ?? null,
      })),
    )
    .returning({ id: recruiters.id });
  const recruiterIds = insertedRecruiters.map((row) => row.id);

  // --- relationships ----------------------------------------------------
  await db.insert(relationships).values(
    seedRelationships.map((r) => ({
      contactId: contactIds[r.contactIndex],
      companyId: companyIds[r.companyIndex],
      role: r.role,
      notes: r.notes ?? null,
    })),
  );

  // --- applications -----------------------------------------------------
  const insertedApplications = await db
    .insert(applications)
    .values(
      seedApplications.map((a) => ({
        companyId: companyIds[a.companyIndex],
        recruiterId:
          a.recruiterIndex !== null ? recruiterIds[a.recruiterIndex] : null,
        primaryContactId:
          a.primaryContactIndex !== null
            ? contactIds[a.primaryContactIndex]
            : null,
        title: a.title,
        location: a.location,
        salaryNote: a.salaryNote,
        stage: a.stage,
        positionInStage: a.positionInStage,
        appliedAt: a.appliedAt,
        notes: a.notes ?? null,
      })),
    )
    .returning({ id: applications.id });
  const applicationIds = insertedApplications.map((row) => row.id);

  // --- email_allowlist --------------------------------------------------
  await db.insert(emailAllowlist).values(
    seedEmailAllowlist.map((e) => ({
      kind: e.kind,
      value: e.value,
      notes: e.notes ?? null,
    })),
  );

  // --- email_events -----------------------------------------------------
  await db.insert(emailEvents).values(
    seedEmailEvents.map((e) => ({
      providerMessageId: e.providerMessageId,
      threadId: e.threadId,
      sender: e.sender,
      subject: e.subject,
      sentAt: e.sentAt,
      applicationId:
        e.applicationIndex !== null ? applicationIds[e.applicationIndex] : null,
    })),
  );

  console.log(
    [
      "Seed complete:",
      `  ${companyIds.length} companies`,
      `  ${contactIds.length} contacts`,
      `  ${recruiterIds.length} recruiters`,
      `  ${seedRelationships.length} relationships`,
      `  ${applicationIds.length} applications`,
      `  ${seedEmailAllowlist.length} email allowlist entries`,
      `  ${seedEmailEvents.length} email events`,
    ].join("\n"),
  );
}

main().then(
  () => {
    process.exit(0);
  },
  (err: unknown) => {
    console.error("Seed failed:", err);
    process.exit(1);
  },
);
