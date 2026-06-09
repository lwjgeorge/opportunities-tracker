import { asc, sql } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { companies, relationships } from "@/db/schema";
import { companyScrapes } from "@/db/scrapes-schema";

export const dynamic = "force-dynamic";

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function loadCompanies() {
  try {
    // Bring back the company row plus two aggregates:
    //   - last_scraped_at: most-recent company_scrapes.fetched_at
    //   - contact_count:   distinct contacts linked via relationships
    // We do these as subqueries so a company with zero relationships still
    // surfaces in the list (a LEFT JOIN + GROUP BY would, but the subquery
    // form is easier to read and the dataset is single-user-small).
    return await db
      .select({
        id: companies.id,
        name: companies.name,
        website: companies.website,
        careersUrl: companies.careersUrl,
        notes: companies.notes,
        createdAt: companies.createdAt,
        lastScrapedAt: sql<Date | null>`(
          select max(${companyScrapes.fetchedAt})
          from ${companyScrapes}
          where ${companyScrapes.companyId} = ${companies.id}
        )`,
        contactCount: sql<number>`(
          select count(distinct ${relationships.contactId})::int
          from ${relationships}
          where ${relationships.companyId} = ${companies.id}
        )`,
      })
      .from(companies)
      .orderBy(asc(companies.name));
  } catch (err) {
    console.warn("companies: DB unavailable", err);
    return [];
  }
}

function formatDate(d: Date | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function CompaniesPage() {
  const rows = await loadCompanies();

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b border-border px-6">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Companies</h1>
          <p className="text-[11px] text-foreground-subtle">
            {rows.length} {rows.length === 1 ? "company" : "companies"}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl">
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-xs text-foreground-subtle">
              No companies yet.{" "}
              <Link href="/capture" className="text-accent hover:underline">
                Capture a note
              </Link>{" "}
              or wait for the Gmail extraction cron to populate them.
            </div>
          ) : (
            <section className="rounded-lg border border-border bg-surface">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] uppercase tracking-wide text-foreground-subtle">
                  <tr>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Website</th>
                    <th className="px-4 py-2 font-medium">Careers</th>
                    <th className="px-4 py-2 font-medium">Contacts</th>
                    <th className="px-4 py-2 font-medium">Last scraped</th>
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
                          href={`/companies/${c.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 font-mono text-foreground-muted">
                        {c.website ? (
                          <a
                            href={c.website}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {hostOf(c.website) ?? c.website}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-foreground-muted">
                        {c.careersUrl ? (
                          <a
                            href={c.careersUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {hostOf(c.careersUrl) ?? "careers"}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-foreground-muted">
                        {c.contactCount}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-foreground-subtle">
                        {formatDate(c.lastScrapedAt)}
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
