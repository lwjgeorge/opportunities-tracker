import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { relationshipCandidates } from "@/db/extraction-schema";

import { CandidateRow } from "./candidate-row";

// Approval mutations revalidate this path; declaring the page dynamic also
// stops Next from trying to statically pre-render it during build (the DB
// connection isn't available in that phase).
export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const rows = await db
    .select()
    .from(relationshipCandidates)
    .where(eq(relationshipCandidates.status, "pending"))
    .orderBy(
      desc(relationshipCandidates.confidence),
      desc(relationshipCandidates.createdAt),
    );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b border-border px-6">
        <div>
          <h1 className="text-sm font-semibold text-foreground">
            Relationship candidates
          </h1>
          <p className="text-[11px] text-foreground-subtle">
            {rows.length} pending - sorted by confidence
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-xs text-foreground-subtle">
              No pending candidates. The extraction cron fills this list as new
              emails are processed.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((row) => (
                <CandidateRow
                  key={row.id}
                  id={row.id}
                  relation={row.relation}
                  contactName={row.contactName}
                  contactEmail={row.contactEmail}
                  companyName={row.companyName}
                  role={row.role}
                  confidence={row.confidence}
                  sourceQuote={row.sourceQuote}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
