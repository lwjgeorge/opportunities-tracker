import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Kanban stages for a job application. The order here is the canonical
 * left-to-right order on the board. `position_in_stage` orders rows within
 * a single stage column.
 */
export const applicationStage = pgEnum("application_stage", [
  "lead",
  "applied",
  "screen",
  "interview",
  "offer",
  "closed_won",
  "closed_lost",
]);

/**
 * Email allowlist entry kind: an entire domain (e.g. "example.com") or a
 * single address (e.g. "recruiter@example.com").
 */
export const emailAllowlistKind = pgEnum("email_allowlist_kind", [
  "domain",
  "address",
]);

/**
 * Discriminator for {@link emailEvents}. Right now only Gmail is wired up,
 * but the column is here so the provider abstraction can store
 * provider-shaped blobs in `raw` without us reshaping the schema later.
 */
export const emailProvider = pgEnum("email_provider", ["gmail"]);

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    website: text("website"),
    careersUrl: text("careers_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("companies_name_idx").on(t.name)],
);

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  linkedinUrl: text("linkedin_url"),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A recruiter is a kind of contact (their personal details live on
 * `contacts`). This row layers on agency + a back-reference so we can
 * distinguish recruiters from hiring-team contacts in the UI.
 */
export const recruiters = pgTable("recruiters", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  agency: text("agency"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Many-to-many between contacts and companies, with role + tenure metadata.
 * A contact can hold multiple roles at the same company over time
 * (e.g. promoted), so this is a plain join table without a uniqueness
 * constraint on (contact, company).
 */
export const relationships = pgTable(
  "relationships",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    role: text("role"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("relationships_contact_idx").on(t.contactId),
    index("relationships_company_idx").on(t.companyId),
  ],
);

export const applications = pgTable(
  "applications",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    recruiterId: integer("recruiter_id").references(() => recruiters.id, {
      onDelete: "set null",
    }),
    primaryContactId: integer("primary_contact_id").references(
      () => contacts.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    sourceUrl: text("source_url"),
    location: text("location"),
    salaryNote: text("salary_note"),
    stage: applicationStage("stage").notNull().default("lead"),
    /**
     * Ordering within `stage`. The kanban writes new values here on drag,
     * so this is an integer (not float) and the UI is expected to renumber
     * when it runs out of gaps. Lower = higher on the board.
     */
    positionInStage: integer("position_in_stage").notNull().default(0),
    notes: text("notes"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("applications_stage_idx").on(t.stage),
    index("applications_stage_position_idx").on(t.stage, t.positionInStage),
    index("applications_company_idx").on(t.companyId),
  ],
);

export const emailEvents = pgTable(
  "email_events",
  {
    id: serial("id").primaryKey(),
    provider: emailProvider("provider").notNull().default("gmail"),
    /** Provider-native message id (e.g. Gmail's `id`). */
    providerMessageId: text("provider_message_id").notNull(),
    threadId: text("thread_id"),
    sender: text("sender").notNull(),
    subject: text("subject"),
    /** When the email was sent, per the provider. */
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    /** Optional link to an application this event relates to. */
    applicationId: integer("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    /**
     * Raw provider payload. Stored as JSONB so the email-provider abstraction
     * can stash whatever shape it wants without schema migrations per
     * provider.
     */
    raw: jsonb("raw").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("email_events_provider_msg_idx").on(
      t.provider,
      t.providerMessageId,
    ),
    index("email_events_thread_idx").on(t.threadId),
    index("email_events_application_idx").on(t.applicationId),
    index("email_events_sent_at_idx").on(t.sentAt),
  ],
);

export const emailAllowlist = pgTable(
  "email_allowlist",
  {
    id: serial("id").primaryKey(),
    kind: emailAllowlistKind("kind").notNull(),
    /**
     * For `kind = 'domain'`: the bare domain, e.g. "example.com".
     * For `kind = 'address'`: the full address, e.g. "recruiter@example.com".
     * Normalised to lower-case at write-time by the caller.
     */
    value: text("value").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("email_allowlist_kind_value_idx").on(t.kind, t.value)],
);

// Row types — exported so other layers can stay strictly typed end-to-end.
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Recruiter = typeof recruiters.$inferSelect;
export type NewRecruiter = typeof recruiters.$inferInsert;
export type Relationship = typeof relationships.$inferSelect;
export type NewRelationship = typeof relationships.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type EmailEvent = typeof emailEvents.$inferSelect;
export type NewEmailEvent = typeof emailEvents.$inferInsert;
export type EmailAllowlistEntry = typeof emailAllowlist.$inferSelect;
export type NewEmailAllowlistEntry = typeof emailAllowlist.$inferInsert;
