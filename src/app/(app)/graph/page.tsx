import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  applications,
  companies,
  contacts,
  recruiters,
  relationships,
} from "@/db/schema";

import { GraphView, type GraphData } from "./graph-view";

// React-flow + dagre layout happen client-side; the server's job is to ship
// a small, serialisable snapshot. Force-dynamic so the page reflects new
// captures immediately (revalidate from /capture already hits this path).
export const dynamic = "force-dynamic";

async function loadGraph(): Promise<GraphData> {
  try {
    const [companyRows, contactRows, recruiterRows, relRows, appRows] =
      await Promise.all([
        db
          .select({
            id: companies.id,
            name: companies.name,
            website: companies.website,
            careersUrl: companies.careersUrl,
            notes: companies.notes,
          })
          .from(companies),
        db
          .select({
            id: contacts.id,
            name: contacts.name,
            email: contacts.email,
            linkedinUrl: contacts.linkedinUrl,
          })
          .from(contacts),
        db
          .select({ id: recruiters.id, contactId: recruiters.contactId })
          .from(recruiters),
        db
          .select({
            id: relationships.id,
            contactId: relationships.contactId,
            companyId: relationships.companyId,
            role: relationships.role,
          })
          .from(relationships),
        db
          .select({
            id: applications.id,
            companyId: applications.companyId,
            primaryContactId: applications.primaryContactId,
            title: applications.title,
            stage: applications.stage,
          })
          .from(applications)
          .leftJoin(companies, eq(applications.companyId, companies.id)),
      ]);

    return {
      companies: companyRows,
      contacts: contactRows,
      recruiterContactIds: recruiterRows.map((r) => r.contactId),
      relationships: relRows,
      applications: appRows,
    };
  } catch (err) {
    console.warn("graph: DB unavailable, returning empty graph", err);
    return {
      companies: [],
      contacts: [],
      recruiterContactIds: [],
      relationships: [],
      applications: [],
    };
  }
}

export default async function GraphPage() {
  const data = await loadGraph();
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b border-border px-6">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Graph</h1>
          <p className="text-[11px] text-foreground-subtle">
            {data.companies.length} companies, {data.contacts.length} contacts,{" "}
            {data.relationships.length} relationships
          </p>
        </div>
      </header>
      <div className="relative flex-1 overflow-hidden">
        <GraphView data={data} />
      </div>
    </div>
  );
}
