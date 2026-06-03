/**
 * Provider-agnostic company-scrape contract.
 *
 * The orchestrator (the refresh-companies cron route) is the only thing that
 * knows about scraper implementations; everything downstream — persistence,
 * later LLM enrichment — reads {@link ScrapeResult.extracted} and the raw
 * `html` blob and never imports a provider directly.
 *
 * Round-2 scope is the cheap, deterministic stuff cheerio can grab. LLM-rich
 * fields (industry, headcount, summary) are out of scope; round 3 will run an
 * LLM over the persisted `html` field.
 *
 * To add a second scraper (e.g. a headless-browser-backed one for JS-heavy
 * targets): see `src/lib/scrape/README.md`.
 */

/**
 * Discriminator union of all wired-up scrapers. Add to this when implementing
 * a new {@link CompanyScraper}; the union is what callers narrow on.
 */
export type CompanyScraperName = "html";

/**
 * Detected social link, narrowed to the platforms we care about today.
 * Anything else is dropped — we keep the union closed so downstream code
 * doesn't have to handle "unknown".
 */
export type SocialLink = {
  kind: "twitter" | "linkedin" | "github" | "youtube";
  url: string;
};

/**
 * Cheap, deterministic extraction from the HTML. No LLM, no JS execution.
 *
 * All string fields are trimmed; all string arrays are deduped (case-sensitive
 * for URLs, case-insensitive for emails — emails are lower-cased).
 */
export type Extracted = {
  /** `<title>`, falling back to `og:title`. */
  title: string | null;
  /** `<meta name="description">`, falling back to `og:description`. */
  description: string | null;
  /** `og:site_name`. */
  siteName: string | null;
  /** Top 10 h1/h2 text, trimmed, deduped, document order. */
  headings: string[];
  /** Links whose href OR text suggests careers/jobs/hiring. */
  careersLinks: string[];
  /** Links whose href OR text suggests an "about" page. */
  aboutLinks: string[];
  /** Links whose href OR text suggests a "contact" page. */
  contactLinks: string[];
  /** Recognised social profile links. */
  socialLinks: SocialLink[];
  /** Email addresses mined from the HTML, lower-cased, deduped. */
  emails: string[];
};

export type ScrapeResult = {
  /** URL we asked for. */
  url: string;
  /** URL we actually landed on after redirects. Equal to `url` if none. */
  finalUrl: string;
  /**
   * HTTP status of the final response. `0` is the sentinel for "never made it
   * that far" (DNS error, robots-blocked, abort, timeout, oversize). When `0`,
   * callers should inspect {@link ScrapeResult.notes} for the reason and
   * {@link Extracted.title} for the sentinel string ("blocked-by-robots").
   */
  httpStatus: number;
  /** Raw HTML body. Null on robots-block, timeout, non-2xx, or oversize. */
  html: string | null;
  fetchedAt: Date;
  extracted: Extracted;
  /** Free-form failure context — empty string on success. */
  notes: string;
};

export interface CompanyScraper {
  readonly name: CompanyScraperName;

  /**
   * Fetch and extract a single URL. Implementations MUST NOT throw on fetch
   * failure or parse failure — return a {@link ScrapeResult} with `html: null`,
   * `httpStatus` set to the actual status (or `0` if no response was received),
   * and `notes` populated. The cron route relies on this so a single bad host
   * does not poison a batch.
   */
  scrape(url: string): Promise<ScrapeResult>;
}

/**
 * Convenience constant for callers that need an empty extraction (e.g. when
 * synthesising a failure result). Frozen so callers can't mutate the shared
 * instance.
 */
export const EMPTY_EXTRACTED: Extracted = Object.freeze({
  title: null,
  description: null,
  siteName: null,
  headings: Object.freeze([]) as unknown as string[],
  careersLinks: Object.freeze([]) as unknown as string[],
  aboutLinks: Object.freeze([]) as unknown as string[],
  contactLinks: Object.freeze([]) as unknown as string[],
  socialLinks: Object.freeze([]) as unknown as SocialLink[],
  emails: Object.freeze([]) as unknown as string[],
});
