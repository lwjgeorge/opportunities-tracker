import { asc, sql } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { contacts, recruiters, relationships } from "@/db/schema";

export const dynamic = "force-dynamic";

async function loadContacts() {
  try {
    return await db
      .select({
        id: contacts.id,
        name: contacts.name,
        email: contacts.email,
        phone: contacts.phone,
        linkedinUrl: contacts.linkedinUrl,
        isRecruiter: sql<boolean>`exists (
          select 1 from ${recruiters} where ${recruiters.contactId} = ${contacts.id}
        )`,
        companyCount: sql<number>`(
          select count(distinct ${relationships.companyId})::int
          from ${relationships}
          where ${relationships.contactId} = ${contacts.id}
        )`,
      })
      .from(contacts)
      .orderBy(asc(contacts.name));
  } catch (err) {
    console.warn("contacts: DB unavailable", err);
    return [];
  }
}

export default async function ContactsPage() {
  const rows = await loadContacts();

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b border-border px-6">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Contacts</h1>
          <p className="text-[11px] text-foreground-subtle">
            {rows.length} {rows.length === 1 ? "contact" : "contacts"}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl">
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-xs text-foreground-subtle">
              No contacts yet.{" "}
              <Link href="/capture" className="text-accent hover:underline">
                Capture a note about someone
              </Link>{" "}
              and they will appear here.
            </div>
          ) : (
            <section className="rounded-lg border border-border bg-surface">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] uppercase tracking-wide text-foreground-subtle">
                  <tr>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 font-medium">Phone</th>
                    <th className="px-4 py-2 font-medium">LinkedIn</th>
                    <th className="px-4 py-2 font-medium">Companies</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-border align-top"
                    >
                      <td className="px-4 py-2">
                        <Link
                          href={`/contacts/${c.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {c.name}
                        </Link>
                        {c.isRecruiter ? (
                          <span className="ml-2 rounded bg-amber-400/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-300">
                            recruiter
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 font-mono text-foreground-muted">
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            className="hover:underline"
                          >
                            {c.email}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-foreground-muted">
                        {c.phone ?? "-"}
                      </td>
                      <td className="px-4 py-2 font-mono text-foreground-muted">
                        {c.linkedinUrl ? (
                          <a
                            href={c.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            linkedin
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-foreground-muted">
                        {c.companyCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
