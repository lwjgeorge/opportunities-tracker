import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/db";
import {
  applications,
  companies,
  contacts,
  relationships,
} from "@/db/schema";
import { STAGE_CONFIG } from "@/lib/stages";

export const dynamic = "force-dynamic";

async function loadCompany(id: number) {
  const rows = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);
  if (rows.length === 0) return null;

  const [relatedContacts, relatedApps] = await Promise.all([
    db
      .select({
        relationshipId: relationships.id,
        contactId: contacts.id,
        contactName: contacts.name,
        contactEmail: contacts.email,
        role: relationships.role,
      })
      .from(relationships)
      .innerJoin(contacts, eq(relationships.contactId, contacts.id))
      .where(eq(relationships.companyId, id))
      .orderBy(asc(contacts.name)),
    db
      .select({
        id: applications.id,
        title: applications.title,
        stage: applications.stage,
        appliedAt: applications.appliedAt,
      })
      .from(applications)
      .where(eq(applications.companyId, id))
      .orderBy(asc(applications.createdAt)),
  ]);

  return { company: rows[0], contacts: relatedContacts, applications: relatedApps };
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id) || id <= 0) notFound();

  let loaded: Awaited<ReturnType<typeof loadCompany>>;
  try {
    loaded = await loadCompany(id);
  } catch (err) {
    console.warn("company detail: DB unavailable", err);
    notFound();
  }
  if (!loaded) notFound();
  const { company, contacts: relatedContacts, applications: relatedApps } = loaded;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <div>
          <Link
            href="/companies"
            className="text-[11px] text-foreground-subtle hover:text-foreground"
          >
            &larr; Companies
          </Link>
          <h1 className="mt-0.5 text-sm font-semibold text-foreground">
            {company.name}
          </h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Details
            </h2>
            <dl className="mt-3 grid grid-cols-[120px_1fr] gap-y-2 text-xs">
              {company.website ? (
                <>
                  <dt className="text-foreground-subtle">Website</dt>
                  <dd className="font-mono">
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground hover:underline"
                    >
                      {company.website}
                    </a>
                  </dd>
                </>
              ) : null}
              {company.careersUrl ? (
                <>
                  <dt className="text-foreground-subtle">Careers</dt>
                  <dd className="font-mono">
                    <a
                      href={company.careersUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground hover:underline"
                    >
                      {company.careersUrl}
                    </a>
                  </dd>
                </>
              ) : null}
              {company.notes ? (
                <>
                  <dt className="text-foreground-subtle">Notes</dt>
                  <dd className="whitespace-pre-wrap text-foreground-muted">
                    {company.notes}
                  </dd>
                </>
              ) : null}
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Contacts ({relatedContacts.length})
            </h2>
            {relatedContacts.length === 0 ? (
              <p className="mt-2 text-xs text-foreground-subtle">
                No linked contacts.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5 text-xs">
                {relatedContacts.map((r) => (
                  <li key={r.relationshipId}>
                    <Link
                      href={`/contacts/${r.contactId}`}
                      className="text-foreground hover:underline"
                    >
                      {r.contactName}
                    </Link>
                    {r.contactEmail ? (
                      <span className="ml-2 font-mono text-foreground-subtle">
                        {"<"}
                        {r.contactEmail}
                        {">"}
                      </span>
                    ) : null}
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
                No applications at this company.
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
