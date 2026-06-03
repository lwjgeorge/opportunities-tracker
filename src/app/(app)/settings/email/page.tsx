import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import { disconnectGoogle } from "./actions";
import { db } from "@/db";
import { oauthTokens } from "@/db/oauth-schema";

/**
 * Gmail OAuth status + connect/disconnect surface. Server-rendered; the
 * "Connect" CTA is a plain anchor to `/api/oauth/google/start` so the browser
 * does the redirect chain end-to-end without client JS.
 */
export const dynamic = "force-dynamic";

function formatTimestamp(d: Date): string {
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SettingsEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;

  // Latest by updated_at — that's what gmail.ts also reads, so the UI and
  // the cron stay in lockstep.
  const rows = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, "google"))
    .orderBy(desc(oauthTokens.updatedAt))
    .limit(1);
  const row = rows[0] ?? null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="text-[11px] text-foreground-subtle hover:text-foreground-muted"
          >
            ← Settings
          </Link>
          <h1 className="text-sm font-semibold text-foreground">
            Email integration
          </h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {params.connected ? (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
              Gmail connected successfully.
            </div>
          ) : null}
          {params.error ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
              {params.error}
            </div>
          ) : null}

          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Gmail
            </h2>

            {row ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-2 w-2 place-items-center">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  <span className="text-sm text-foreground">
                    Connected as{" "}
                    <span className="font-medium">
                      {row.accountEmail ?? "(email unknown)"}
                    </span>
                  </span>
                </div>
                <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-foreground-subtle">Scopes</dt>
                  <dd className="break-words font-mono text-foreground-muted">
                    {row.scopes ?? "(not recorded)"}
                  </dd>
                  <dt className="text-foreground-subtle">Last refreshed</dt>
                  <dd className="text-foreground-muted">
                    {formatTimestamp(row.updatedAt)}
                  </dd>
                </dl>
                <form action={disconnectGoogle} className="pt-2">
                  <input type="hidden" name="id" value={String(row.id)} />
                  <button
                    type="submit"
                    className="rounded border border-border px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground"
                  >
                    Disconnect
                  </button>
                </form>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-foreground-subtle" />
                  <span className="text-sm text-foreground">Not connected</span>
                </div>
                <p className="text-xs text-foreground-muted">
                  Connect a Google account to let the cron poll Gmail for
                  messages from allowlisted senders. Read-only access only.
                </p>
                <a
                  href="/api/oauth/google/start"
                  className="inline-block rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90"
                >
                  Connect Gmail
                </a>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
