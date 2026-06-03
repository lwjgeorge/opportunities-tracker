import { and, asc, desc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { companies } from "@/db/schema";
import { companyScrapes } from "@/db/scrapes-schema";
import { HtmlCompanyScraper } from "@/lib/scrape/providers/html";

// Hard cap per invocation. Vercel cron windows are small; refresh in chunks.
const MAX_BATCH = 10;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h
const SAME_HOST_GAP_MS = 1_000;

// Make this route fully dynamic — it touches DB and reads request headers.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Candidate = {
  id: number;
  website: string;
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Lazy-import the db client. `src/db/index.ts` throws at module-evaluation
 * time when `DATABASE_URL` is missing, and `next build`'s page-data
 * collection step evaluates every route. Importing inside the handler keeps
 * the build green when env vars are not set (e.g. CI without secrets).
 */
async function getDb() {
  const mod = await import("@/db");
  return mod.db;
}

/**
 * Pick up to {@link MAX_BATCH} companies whose latest scrape is older than
 * 24h, plus companies that have never been scraped. Oldest-first.
 *
 * Implementation: LEFT JOIN companies on their MAX(fetched_at) per company,
 * filter to (no scrape) OR (last fetched_at < cutoff), then order by that
 * MAX ascending so never-scraped (NULL) come first.
 */
async function pickStaleCompanies(
  db: Awaited<ReturnType<typeof getDb>>,
  now: Date,
): Promise<Candidate[]> {
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);

  const latestScrape = db
    .select({
      companyId: companyScrapes.companyId,
      lastFetchedAt: sql<Date>`max(${companyScrapes.fetchedAt})`.as(
        "last_fetched_at",
      ),
    })
    .from(companyScrapes)
    .groupBy(companyScrapes.companyId)
    .as("latest_scrape");

  const rows = await db
    .select({
      id: companies.id,
      website: companies.website,
      lastFetchedAt: latestScrape.lastFetchedAt,
    })
    .from(companies)
    .leftJoin(latestScrape, eq(latestScrape.companyId, companies.id))
    .where(
      and(
        isNotNull(companies.website),
        or(
          isNull(latestScrape.lastFetchedAt),
          lt(latestScrape.lastFetchedAt, cutoff),
        ),
      ),
    )
    // NULLs first by default in Postgres ASC — that's what we want
    // (never-scraped first, then oldest).
    .orderBy(asc(latestScrape.lastFetchedAt), desc(companies.id))
    .limit(MAX_BATCH);

  const out: Candidate[] = [];
  for (const r of rows) {
    if (typeof r.website === "string" && r.website.length > 0) {
      out.push({ id: r.id, website: r.website });
    }
  }
  return out;
}

/** Sleep helper — no external dep. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const scraper = new HtmlCompanyScraper();
  const now = new Date();
  const candidates = await pickStaleCompanies(db, now);

  // Per-host throttle: remember when we last hit each host so we can sleep
  // SAME_HOST_GAP_MS before going again. Different hosts run back-to-back.
  // We run sequentially because the batch is tiny (<=10) and most hosts will
  // be distinct — parallelism wouldn't buy much and complicates the throttle.
  const lastHitByHost = new Map<string, number>();
  const errors: Array<{ companyId: number; url: string; note: string }> = [];
  let refreshed = 0;

  for (const c of candidates) {
    const host = hostOf(c.website);
    if (host) {
      const last = lastHitByHost.get(host);
      if (last !== undefined) {
        const wait = SAME_HOST_GAP_MS - (Date.now() - last);
        if (wait > 0) await sleep(wait);
      }
    }

    const result = await scraper.scrape(c.website);
    if (host) lastHitByHost.set(host, Date.now());

    try {
      await db.insert(companyScrapes).values({
        companyId: c.id,
        url: result.url,
        finalUrl: result.finalUrl,
        httpStatus: result.httpStatus,
        html: result.html,
        extracted: result.extracted,
        fetchedAt: result.fetchedAt,
        notes: result.notes || null,
      });
      refreshed++;
      if (result.httpStatus < 200 || result.httpStatus >= 300) {
        errors.push({
          companyId: c.id,
          url: c.website,
          note: result.notes || `status ${result.httpStatus}`,
        });
      }
    } catch (err) {
      errors.push({
        companyId: c.id,
        url: c.website,
        note: `db insert failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return NextResponse.json({ refreshed, errors });
}
