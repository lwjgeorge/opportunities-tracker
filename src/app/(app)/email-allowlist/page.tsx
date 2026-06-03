import { desc } from "drizzle-orm";

import { AllowlistAddForm } from "./add-form";
import { addAllowlistEntry, deleteAllowlistEntry } from "./actions";
import { db } from "@/db";
import { emailAllowlist } from "@/db/schema";

/**
 * Server-rendered admin surface for the email allowlist. Single-user, so we
 * skip JS confirmations on delete and rely on the table being short.
 */

// The DB unique-index will reject duplicates at insert time — see actions.ts.
export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function EmailAllowlistPage({
  searchParams,
}: {
  // Errors from the add-form server action come back via a redirect; we
  // surface them here so the user sees what failed.
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const rows = await db
    .select()
    .from(emailAllowlist)
    .orderBy(desc(emailAllowlist.createdAt));

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b border-border px-6">
        <div>
          <h1 className="text-sm font-semibold text-foreground">
            Email allowlist
          </h1>
          <p className="text-[11px] text-foreground-subtle">
            {rows.length} {rows.length === 1 ? "entry" : "entries"}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Add entry
            </h2>
            <AllowlistAddForm
              action={addAllowlistEntry}
              error={params.error}
            />
          </section>

          <section className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                Entries
              </h2>
            </div>
            {rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-foreground-subtle">
                No entries yet. Add a domain (e.g. example.com) or an address
                to start receiving Gmail events from that sender.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] uppercase tracking-wide text-foreground-subtle">
                  <tr>
                    <th className="px-4 py-2 font-medium">Kind</th>
                    <th className="px-4 py-2 font-medium">Value</th>
                    <th className="px-4 py-2 font-medium">Notes</th>
                    <th className="px-4 py-2 font-medium">Added</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-border align-top"
                    >
                      <td className="px-4 py-2">
                        <span
                          className={
                            row.kind === "domain"
                              ? "rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent"
                              : "rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-muted"
                          }
                        >
                          {row.kind}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-[12px] text-foreground">
                        {row.value}
                      </td>
                      <td className="px-4 py-2 text-foreground-muted">
                        {row.notes ?? ""}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-foreground-subtle">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <form action={deleteAllowlistEntry}>
                          <input
                            type="hidden"
                            name="id"
                            value={String(row.id)}
                          />
                          <button
                            type="submit"
                            className="rounded border border-border px-2 py-1 text-[11px] text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground"
                          >
                            Delete
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
