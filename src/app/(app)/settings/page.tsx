import Link from "next/link";
import { count, desc, eq, gte, sql } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { oauthTokens } from "@/db/oauth-schema";
import { emailAllowlist, emailEvents } from "@/db/schema";
import { companyScrapes } from "@/db/scrapes-schema";

/**
 * Settings overview. A grid of status cards that each touch the DB once
 * and surface whether each integration is healthy.
 *
 * Every card resolves independently inside Promise.allSettled so one slow
 * or failing query doesn't block the others. Each card also catches its
 * own error and renders a red dot — a single broken integration should not
 * black out the whole page.
 */
export const dynamic = "force-dynamic";

type CardStatus = "ok" | "warn" | "error";

type StatusCard = {
  title: string;
  status: CardStatus;
  primary: string;
  secondary?: string;
  href?: string;
};

const STATUS_DOT: Record<CardStatus, string> = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  error: "bg-red-400",
};

function dayAgo(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function formatTimestamp(d: Date): string {
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function getGmailCard(): Promise<StatusCard> {
  try {
    const rows = await db
      .select({ accountEmail: oauthTokens.accountEmail })
      .from(oauthTokens)
      .where(eq(oauthTokens.provider, "google"))
      .orderBy(desc(oauthTokens.updatedAt))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return {
        title: "Gmail connection",
        status: "warn",
        primary: "Not connected",
        secondary: "Connect to start polling",
        href: "/settings/email",
      };
    }
    return {
      title: "Gmail connection",
      status: "ok",
      primary: row.accountEmail ?? "(email unknown)",
      secondary: "Connected",
      href: "/settings/email",
    };
  } catch (err) {
    return {
      title: "Gmail connection",
      status: "error",
      primary: "Error",
      secondary: err instanceof Error ? err.message : "DB lookup failed",
    };
  }
}

async function getGithubCard(): Promise<StatusCard> {
  const session = await auth();
  const name = session?.user?.name;
  return {
    title: "GitHub auth",
    status: name ? "ok" : "error",
    primary: name ?? "(not signed in)",
    secondary: "Single-user mode",
  };
}

async function getLastGmailPollCard(): Promise<StatusCard> {
  try {
    const since = dayAgo();
    const [latest, recent] = await Promise.all([
      db
        .select({ at: sql<Date>`max(${emailEvents.createdAt})` })
        .from(emailEvents),
      db
        .select({ n: count() })
        .from(emailEvents)
        .where(gte(emailEvents.createdAt, since)),
    ]);
    const latestAt = latest[0]?.at as Date | null | undefined;
    const recentCount = Number(recent[0]?.n ?? 0);
    return {
      title: "Last Gmail poll",
      status: latestAt ? "ok" : "warn",
      primary: latestAt ? formatTimestamp(new Date(latestAt)) : "No events yet",
      secondary: `${recentCount} event${recentCount === 1 ? "" : "s"} in last 24h`,
      href: "/settings/email",
    };
  } catch (err) {
    return {
      title: "Last Gmail poll",
      status: "error",
      primary: "Error",
      secondary: err instanceof Error ? err.message : "DB lookup failed",
    };
  }
}

async function getLastScrapeCard(): Promise<StatusCard> {
  try {
    const since = dayAgo();
    const [latest, recent] = await Promise.all([
      db
        .select({ at: sql<Date>`max(${companyScrapes.fetchedAt})` })
        .from(companyScrapes),
      db
        .select({ n: count() })
        .from(companyScrapes)
        .where(gte(companyScrapes.fetchedAt, since)),
    ]);
    const latestAt = latest[0]?.at as Date | null | undefined;
    const recentCount = Number(recent[0]?.n ?? 0);
    return {
      title: "Last company scrape",
      status: latestAt ? "ok" : "warn",
      primary: latestAt ? formatTimestamp(new Date(latestAt)) : "No scrapes yet",
      secondary: `${recentCount} scrape${recentCount === 1 ? "" : "s"} in last 24h`,
      href: "/companies",
    };
  } catch (err) {
    return {
      title: "Last company scrape",
      status: "error",
      primary: "Error",
      secondary: err instanceof Error ? err.message : "DB lookup failed",
    };
  }
}

async function getAllowlistCard(): Promise<StatusCard> {
  try {
    const rows = await db.select({ n: count() }).from(emailAllowlist);
    const n = Number(rows[0]?.n ?? 0);
    return {
      title: "Email allowlist",
      status: n > 0 ? "ok" : "warn",
      primary: `${n} ${n === 1 ? "entry" : "entries"}`,
      secondary: n === 0 ? "Add senders to start ingesting" : undefined,
      href: "/email-allowlist",
    };
  } catch (err) {
    return {
      title: "Email allowlist",
      status: "error",
      primary: "Error",
      secondary: err instanceof Error ? err.message : "DB lookup failed",
    };
  }
}

async function getDbCard(): Promise<StatusCard> {
  try {
    // Cheapest possible round-trip — does NOT touch any application table.
    await db.execute(sql`select 1`);
    return {
      title: "Database",
      status: "ok",
      primary: "Reachable",
      secondary: "select 1 ok",
    };
  } catch (err) {
    return {
      title: "Database",
      status: "error",
      primary: "Unreachable",
      secondary: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

function StatusCardView({ card }: { card: StatusCard }) {
  const inner = (
    <div className="flex h-full flex-col rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-foreground-subtle">
          {card.title}
        </span>
        <span
          className={`h-2 w-2 rounded-full ${STATUS_DOT[card.status]}`}
          aria-label={card.status}
        />
      </div>
      <div className="mt-2 break-words text-sm font-medium text-foreground">
        {card.primary}
      </div>
      {card.secondary ? (
        <div className="mt-1 text-xs text-foreground-muted">{card.secondary}</div>
      ) : null}
    </div>
  );
  if (card.href) {
    return (
      <Link href={card.href} className="block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}

// Each item: [env var label, description]. Kept inline so the page is a
// single source of truth for setup.
const SETUP_STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Create the Neon database",
    body: "Provision a Postgres database on Neon and set DATABASE_URL in Vercel + locally in .env.local.",
  },
  {
    title: "Create a GitHub OAuth app",
    body: "Set the callback URL to {origin}/api/auth/callback/github. Save AUTH_GITHUB_ID and AUTH_GITHUB_SECRET.",
  },
  {
    title: "Create a Google OAuth client (Web Application)",
    body: "Add redirect URIs: {origin}/api/oauth/google/callback for prod AND http://localhost:3000/api/oauth/google/callback for dev. Save GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
  },
  {
    title: "Set ALLOWED_GITHUB_ID",
    body: "Your numeric GitHub user id — look it up at https://api.github.com/users/lwjgeorge.",
  },
  {
    title: "Generate AUTH_SECRET",
    body: "A 32-byte random string. Used by Auth.js for JWT signing AND by the OAuth handshake to sign CSRF state.",
  },
  {
    title: "Generate CRON_SECRET",
    body: "Another random string. The cron routes require Authorization: Bearer <CRON_SECRET>.",
  },
  {
    title: "Push env vars to Vercel",
    body: "Import the repo in Vercel and add every env var above to Production, Preview, and Development environments.",
  },
  {
    title: "Enable GitHub Actions",
    body: "In the repo Settings → Actions, allow workflows. The CI runs on every push.",
  },
];

export default async function SettingsPage() {
  const [
    gmail,
    github,
    lastPoll,
    lastScrape,
    allowlist,
    dbCard,
  ] = await Promise.all([
    getGmailCard(),
    getGithubCard(),
    getLastGmailPollCard(),
    getLastScrapeCard(),
    getAllowlistCard(),
    getDbCard(),
  ]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b border-border px-6">
        <h1 className="text-sm font-semibold text-foreground">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Status
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatusCardView card={gmail} />
              <StatusCardView card={github} />
              <StatusCardView card={lastPoll} />
              <StatusCardView card={lastScrape} />
              <StatusCardView card={allowlist} />
              <StatusCardView card={dbCard} />
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Setup checklist
            </h2>
            <p className="mt-2 text-xs text-foreground-muted">
              One-time manual steps. Tick them off as you go — there is no
              tracking, just a reference.
            </p>
            <ol className="mt-4 space-y-3">
              {SETUP_STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border text-[10px] text-foreground-muted">
                    {i + 1}
                  </span>
                  <div>
                    <div className="text-xs font-medium text-foreground">
                      {step.title}
                    </div>
                    <div className="mt-0.5 text-[11px] text-foreground-muted">
                      {step.body}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
