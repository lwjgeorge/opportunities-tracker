import { eq } from "drizzle-orm";

import { Board } from "@/components/kanban/Board";
import { db } from "@/db";
import { applications, companies } from "@/db/schema";
import { mockApplications, mockCompanies } from "@/lib/mock-data";
import type { Application, Company } from "@/lib/types";

interface LoadedBoard {
  apps: Application[];
  companies: Company[];
  source: "db" | "mock";
}

/**
 * Load the kanban data. Tries the DB first; on any failure (lazy-db throw
 * because DATABASE_URL is unset, query rejected, network unreachable, etc.)
 * we fall back to the static mock dataset so the UI is never dead.
 */
async function loadBoard(): Promise<LoadedBoard> {
  try {
    const rows = await db
      .select({
        id: applications.id,
        title: applications.title,
        stage: applications.stage,
        positionInStage: applications.positionInStage,
        notes: applications.notes,
        appliedAt: applications.appliedAt,
        createdAt: applications.createdAt,
        updatedAt: applications.updatedAt,
        companyId: applications.companyId,
        companyName: companies.name,
      })
      .from(applications)
      .leftJoin(companies, eq(applications.companyId, companies.id))
      .orderBy(applications.stage, applications.positionInStage);

    // Build the Company[] referenced by the board from the joined rows.
    const seenCompanies = new Map<string, Company>();
    for (const row of rows) {
      if (row.companyId == null) continue;
      const id = String(row.companyId);
      if (seenCompanies.has(id)) continue;
      seenCompanies.set(id, {
        id,
        name: row.companyName ?? "Unknown",
        domain: null,
        industry: null,
        headcountBand: null,
        hqLocation: null,
        lastScrapedAt: null,
      });
    }

    const apps: Application[] = rows.map((r) => ({
      id: String(r.id),
      title: r.title,
      companyId: String(r.companyId),
      stage: r.stage,
      positionInStage: r.positionInStage,
      notes: r.notes,
      appliedAt: r.appliedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return { apps, companies: Array.from(seenCompanies.values()), source: "db" };
  } catch (err) {
    console.warn("kanban: DB unavailable, using mock data", err);
    return {
      apps: mockApplications,
      companies: mockCompanies,
      source: "mock",
    };
  }
}

export default async function ApplicationsPage() {
  const { apps, companies: companyRows, source } = await loadBoard();

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Applications</h1>
          <p className="text-[11px] text-foreground-subtle">
            {apps.length} active across all stages
          </p>
        </div>
      </header>
      {source === "mock" ? (
        <div className="border-b border-border bg-surface/40 px-6 py-2 text-[11px] text-foreground-subtle">
          Demo data — connect a database to see your real applications.
        </div>
      ) : null}
      <div className="flex-1 overflow-hidden">
        <Board
          initialApplications={apps}
          companies={companyRows}
          source={source}
        />
      </div>
    </div>
  );
}
