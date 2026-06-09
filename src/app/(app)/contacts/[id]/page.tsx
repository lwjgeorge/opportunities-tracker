import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/db";
import {
  applications,
  companies,
  contacts,
  recruiters,
  relationships,
} from "@/db/schema";
import { STAGE_CONFIG } from "@/lib/stages";

export const dynamic = "force-dynamic";

async function loadContact(id: number) {
  const rows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);
  if (rows.length === 0) return null;

  const [relatedCompanies, relatedApps, isRecruiterRows] = await Promise.all([
    db
      .select({
        relationshipId: relationships.id,
        companyId: companies.id,
        companyName: companies.name,
        role: relationships.role,
      })
      .from(relationships)
      .innerJoin(companies, eq(relationships.companyId, companies.id))
      .where(eq(relationships.contactId, id))
      .orderBy(asc(companies.name)),
    db
      .select({
        id: applications.id,
        title: applications.title,
        stage: applications.stage,
        companyId: applications.companyId,
      })
      .from(applications)
      .where(eq(applications.primaryContactId, id))
      .orderBy(asc(applications.createdAt)),
    db
      .select({ id: recruiters.id })
      .from(recruiters)
      .where(eq(recruiters.contactId, id))
      .limit(1),
  ]);

  return {
    contact: rows[0],
    companies: relatedCompanies,
    applications: relatedApps,
    isRecruiter: isRecruiterRows.length > 0,
  };
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id) || id <= 0) notFound();

  let loaded: Awaited<ReturnType<typeof loadContact>>;
  try {
    loaded = await loadContact(id);
  } catch (err) {
    console.warn("contact detail: DB unavailable", err);
    notFound();
  }
  if (!loaded) notFound();
  const {
    contact,
    companies: relatedCompanies,
    applications: relatedApps,
    isRecruiter,
  } = loaded;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <div>
          <Link
            href="/contacts"
            className="text-[11px] text-foreground-subtle hover:text-foreground"
          >
            &larr; Contacts
          </Link>
          <div className="mt-0.5 flex items-center gap-2">
            <h1 className="text-sm font-semibold text-foreground">
              {contact.name}
            </h1>
            {isRecruiter ? (
              <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                recruiter
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Details
            </h2>
            <dl className="mt-3 grid grid-cols-[120px_1fr] gap-y-2 text-xs">
              {contact.email ? (
                <>
                  <dt className="text-foreground-subtle">Email</dt>
                  <dd className="font-mono">
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-foreground hover:underline"
                    >
                      {contact.email}
                    </a>
                  </dd>
                </>
              ) : null}
              {contact.phone ? (
                <>
                  <dt className="text-foreground-subtle">Phone</dt>
                  <dd className="font-mono text-foreground">{contact.phone}</dd>
                </>
              ) : null}
              {contact.linkedinUrl ? (
                <>
                  <dt className="text-foreground-subtle">LinkedIn</dt>
                  <dd className="font-mono">
                    <a
                      href={contact.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground hover:underline"
                    >
                      {contact.linkedinUrl}
                    </a>
                  </dd>
                </>
              ) : null}
              {contact.notes ? (
                <>
                  <dt className="text-foreground-subtle">Notes</dt>
                  <dd className="whitespace-pre-wrap text-foreground-muted">
                    {contact.notes}
                  </dd>
                </>
              ) : null}
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Companies ({relatedCompanies.length})
            </h2>
            {relatedCompanies.length === 0 ? (
              <p className="mt-2 text-xs text-foreground-subtle">
                No company links.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5 text-xs">
                {relatedCompanies.map((r) => (
                  <li key={r.relationshipId}>
                    <Link
                      href={`/companies/${r.companyId}`}
                      className="text-foreground hover:underline"
                    >
                      {r.companyName}
                    </Link>
                    {r.role ? (
                      <span className="ml-2 text-foreground-muted">
                        - {r.role}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Applications ({relatedApps.length})
            </h2>
            {relatedApps.length === 0 ? (
              <p className="mt-2 text-xs text-foreground-subtle">
                No applications linked to this contact.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5 text-xs">
                {relatedApps.map((a) => (
                  <li key={a.id}>
                    <span className="text-foreground">{a.title}</span>
                    <span className="ml-2 text-foreground-subtle">
                      - {STAGE_CONFIG[a.stage]?.label ?? a.stage}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
