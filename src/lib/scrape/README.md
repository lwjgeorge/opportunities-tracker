# Scrape provider abstraction

Provider-agnostic company-scrape pipeline. The orchestrator (the
`/api/cron/refresh-companies` route) is the only thing that knows about
provider implementations; everything downstream — persistence in the
`company_scrapes` table, later LLM enrichment — works off the `ScrapeResult`
shape defined in `types.ts` and never imports a provider directly.

## Contract

A `CompanyScraper` exposes:

```ts
interface CompanyScraper {
  readonly name: CompanyScraperName;
  scrape(url: string): Promise<ScrapeResult>;
}
```

Implementations MUST NOT throw on fetch failure or parse failure. They return
a `ScrapeResult` with `html: null`, `httpStatus` set to the actual status (or
`0` if no response was received), and a populated `notes` string. The cron
route relies on this so a single bad host does not poison a batch.

## Round-2 scope

`Extracted` covers the cheap, deterministic stuff cheerio can pull:

- `title`, `description`, `siteName`
- `headings` (top 10 h1/h2)
- `careersLinks`, `aboutLinks`, `contactLinks`
- `socialLinks` (twitter / linkedin / github / youtube)
- `emails` (regex-mined, lower-cased, deduped)

LLM-rich extraction (industry, headcount, summary) is out of scope. Round 3
will run an LLM over the raw `html` field persisted on `company_scrapes`.

## HTML scraper specifics

`providers/html.ts` (the only scraper today) does:

- `fetch` with a 15s `AbortController` timeout.
- Hard 2 MB body cap, enforced both by `Content-Length` and by streaming the
  body and bailing if the cap is crossed.
- Follows redirects (default `redirect: "follow"`), records `finalUrl`.
- User-Agent: `OpportunitiesTracker/0.1 (+https://github.com/lwjgeorge/opportunities-tracker)`.
- Robots.txt: GETs `{origin}/robots.txt` before fetching, parses
  `User-agent: *` and `User-agent: OpportunitiesTracker*` groups, honours
  `Disallow:` lines. On block, returns a `ScrapeResult` with `httpStatus: 0`,
  `html: null`, and `extracted.title = "blocked-by-robots"` as a sentinel.
- Non-2xx responses still produce a `ScrapeResult` (with `html: null` and
  `notes: "non-2xx: 404"` etc.) — the row is persisted so we can see history.

## Adding a second scraper

1. Add the new name to the `CompanyScraperName` union in `types.ts`.
2. Create `src/lib/scrape/providers/<name>.ts` exporting a class that
   implements `CompanyScraper`.
3. The orchestrator picks which scraper to use — for now it's hard-coded to
   `HtmlCompanyScraper`. When we add (say) a headless-browser scraper for
   JS-heavy targets, the orchestrator will route per company URL (e.g. via a
   per-domain allowlist) and we'll generalise the cron route at that point.
4. There is NO change required to `company_scrapes` — the table is provider-
   agnostic; the chosen scraper's `name` can be persisted in `notes` if we
   ever care, but we don't today.

## Throttle policy

Lives in the cron route, not the scraper. Round 2: 1 concurrent fetch per
host, 1s gap between requests to the same host. The cron route runs the batch
sequentially (it's <=10 companies; most hosts are distinct anyway), tracking
each host's `lastHitAt` in a `Map<string, number>` and sleeping the
difference when the same host comes up again. If we ever need real
parallelism we'll bring in `p-limit` then.

## Why no headless browser

The vast majority of company homepages and careers pages render meaningful
content in static HTML. Headless browsers are an order of magnitude more
expensive (cold-start, RAM, egress) and break in serverless environments
without warm caches. Escalate to a headless scraper only when a specific
target is confirmed to require JS execution.
