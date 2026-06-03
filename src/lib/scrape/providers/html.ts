import * as cheerio from "cheerio";

import {
  type CompanyScraper,
  type CompanyScraperName,
  EMPTY_EXTRACTED,
  type Extracted,
  type ScrapeResult,
  type SocialLink,
} from "../types";

const USER_AGENT =
  "OpportunitiesTracker/0.1 (+https://github.com/lwjgeorge/opportunities-tracker)";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB

const CAREER_KEYWORDS = ["careers", "jobs", "open roles", "we're hiring"];
const ABOUT_KEYWORDS = ["about"];
const CONTACT_KEYWORDS = ["contact"];

/**
 * RFC 5322-lite email regex. Intentionally permissive on the local part and
 * conservative on the host (no bare hostnames, must have a dot + TLD). We mine
 * the raw HTML so false positives are filtered downstream when reconciling.
 */
const EMAIL_REGEX =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Build an absolute URL from a possibly-relative one, anchored on `base`.
 * Returns `null` on garbage (e.g. `mailto:`, `javascript:`, malformed input).
 */
function toAbsoluteHttpUrl(href: string, base: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Classify a link as a known social platform. Returns `null` if the host
 * isn't one we care about.
 */
function classifySocial(url: string): SocialLink["kind"] | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  // Strip leading "www." for matching.
  if (host.startsWith("www.")) host = host.slice(4);
  if (host === "twitter.com" || host === "x.com") return "twitter";
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    return "linkedin";
  }
  if (host === "github.com") return "github";
  if (host === "youtube.com" || host === "youtu.be") return "youtube";
  return null;
}

function lowerIncludesAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

/**
 * Push `value` into `arr` unless an exact match is already present.
 * Mutates `arr` and returns it for chaining.
 */
function pushUnique<T>(arr: T[], value: T): T[] {
  if (!arr.includes(value)) arr.push(value);
  return arr;
}

type FetchOutcome =
  | {
      ok: true;
      status: number;
      finalUrl: string;
      html: string;
    }
  | {
      ok: false;
      // 0 means "never got a response" (DNS, abort, timeout, oversize).
      status: number;
      finalUrl: string | null;
      notes: string;
    };

/**
 * GET `url` with a timeout and a hard 2 MB body cap. We stream the body and
 * abort the moment we cross the cap so a hostile/large server can't OOM us.
 */
async function fetchWithCaps(url: string): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted =
      err instanceof DOMException && err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      finalUrl: null,
      notes: aborted
        ? `timeout after ${FETCH_TIMEOUT_MS}ms`
        : `fetch error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Up-front content-length check.
  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const len = Number.parseInt(lenHeader, 10);
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
      clearTimeout(timeout);
      // Drain and discard so the connection can be reused / closed cleanly.
      try {
        await res.body?.cancel();
      } catch {
        // best-effort
      }
      return {
        ok: false,
        status: res.status,
        finalUrl: res.url,
        notes: `oversize: content-length ${len} > ${MAX_BODY_BYTES}`,
      };
    }
  }

  // Stream-cap: read chunks and bail if we cross the cap.
  if (!res.body) {
    clearTimeout(timeout);
    return {
      ok: false,
      status: res.status,
      finalUrl: res.url,
      notes: "no response body",
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let received = 0;
  let html = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // best-effort
        }
        clearTimeout(timeout);
        return {
          ok: false,
          status: res.status,
          finalUrl: res.url,
          notes: `oversize: streamed > ${MAX_BODY_BYTES} bytes`,
        };
      }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
  } catch (err) {
    clearTimeout(timeout);
    const aborted =
      err instanceof DOMException && err.name === "AbortError";
    return {
      ok: false,
      status: res.status,
      finalUrl: res.url,
      notes: aborted
        ? `timeout after ${FETCH_TIMEOUT_MS}ms (mid-stream)`
        : `stream error: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timeout);
  }

  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      status: res.status,
      finalUrl: res.url,
      notes: `non-2xx: ${res.status}`,
    };
  }

  return { ok: true, status: res.status, finalUrl: res.url, html };
}

/**
 * Minimal robots.txt parser. Honours `User-agent: *` and any group whose
 * agent token matches `OpportunitiesTracker` (case-insensitive prefix). Only
 * `Disallow:` lines are consulted; we don't claim to implement the full spec.
 *
 * Returns `true` if `targetPath` is allowed, `false` if any matching group
 * disallows it. Empty/missing rules => allowed.
 */
export function isAllowedByRobots(
  robotsTxt: string,
  ourAgentToken: string,
  targetPath: string,
): boolean {
  // Split into groups separated by blank lines; each group starts with one or
  // more `User-agent:` lines followed by directives.
  const lines = robotsTxt
    .split(/\r?\n/)
    .map((l) => {
      // Strip comments.
      const hashIdx = l.indexOf("#");
      return (hashIdx >= 0 ? l.slice(0, hashIdx) : l).trim();
    });

  type Group = { agents: string[]; disallows: string[] };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const line of lines) {
    if (!line) {
      current = null;
      lastWasAgent = false;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallows: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "disallow") {
      if (current) current.disallows.push(value);
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }

  const ourToken = ourAgentToken.toLowerCase();
  const applicable = groups.filter((g) =>
    g.agents.some((a) => a === "*" || ourToken.startsWith(a) || a.startsWith(ourToken)),
  );
  if (applicable.length === 0) return true;

  for (const g of applicable) {
    for (const rule of g.disallows) {
      if (rule === "") continue; // empty Disallow = allow all
      if (targetPath.startsWith(rule)) return false;
    }
  }
  return true;
}

async function checkRobots(targetUrl: string): Promise<{
  allowed: boolean;
  notes: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { allowed: false, notes: "invalid url" };
  }
  const robotsUrl = `${parsed.origin}/robots.txt`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(robotsUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    if (res.status === 404 || res.status === 410) {
      // No robots => allowed.
      return { allowed: true, notes: "" };
    }
    if (res.status < 200 || res.status >= 300) {
      // Per RFC 9309 §2.3.1, treat 4xx (except 401/403) as "allow all"; 5xx as
      // "disallow all". We keep it simple: anything non-2xx that isn't a
      // clean 404/410 => be conservative and allow, but note it.
      return { allowed: true, notes: `robots: non-2xx ${res.status}` };
    }
    const body = await res.text();
    const path = parsed.pathname + (parsed.search || "");
    const allowed = isAllowedByRobots(body, "OpportunitiesTracker", path);
    return {
      allowed,
      notes: allowed ? "" : "blocked by robots",
    };
  } catch (err) {
    const aborted =
      err instanceof DOMException && err.name === "AbortError";
    // Network failure fetching robots — be permissive (RFC 9309 §2.3.1.4 says
    // "unreachable" can be treated as allow-all). Note it so it shows up.
    return {
      allowed: true,
      notes: aborted ? "robots: timeout" : `robots: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function dedupeStrings(values: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export function extract(html: string, baseUrl: string): Extracted {
  const $ = cheerio.load(html);

  const titleTag = $("title").first().text().trim() || null;
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() || null;
  const title = titleTag ?? ogTitle;

  const metaDesc =
    $('meta[name="description"]').attr("content")?.trim() || null;
  const ogDesc =
    $('meta[property="og:description"]').attr("content")?.trim() || null;
  const description = metaDesc ?? ogDesc;

  const siteName =
    $('meta[property="og:site_name"]').attr("content")?.trim() || null;

  const headings = dedupeStrings(
    $("h1, h2")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((s): s is string => s.length > 0),
  ).slice(0, 10);

  const careersLinks: string[] = [];
  const aboutLinks: string[] = [];
  const contactLinks: string[] = [];
  const socialLinks: SocialLink[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = toAbsoluteHttpUrl(href, baseUrl);
    if (!abs) return;
    const text = $(el).text();
    const haystack = `${href} ${text}`;

    if (lowerIncludesAny(haystack, CAREER_KEYWORDS)) {
      pushUnique(careersLinks, abs);
    }
    if (lowerIncludesAny(haystack, ABOUT_KEYWORDS)) {
      pushUnique(aboutLinks, abs);
    }
    if (lowerIncludesAny(haystack, CONTACT_KEYWORDS)) {
      pushUnique(contactLinks, abs);
    }
    const kind = classifySocial(abs);
    if (kind) {
      // Dedupe by (kind, url) — we keep the first occurrence's URL casing.
      if (!socialLinks.some((s) => s.kind === kind && s.url === abs)) {
        socialLinks.push({ kind, url: abs });
      }
    }
  });

  const emailMatches = html.match(EMAIL_REGEX) ?? [];
  const emails = dedupeStrings(
    emailMatches.map((e) => e.toLowerCase()),
  );

  return {
    title,
    description,
    siteName,
    headings,
    careersLinks,
    aboutLinks,
    contactLinks,
    socialLinks,
    emails,
  };
}

export class HtmlCompanyScraper implements CompanyScraper {
  readonly name: CompanyScraperName = "html";

  async scrape(url: string): Promise<ScrapeResult> {
    const fetchedAt = new Date();

    // Validate URL up-front; spare ourselves a network round-trip on garbage.
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return {
          url,
          finalUrl: url,
          httpStatus: 0,
          html: null,
          fetchedAt,
          extracted: { ...EMPTY_EXTRACTED },
          notes: `unsupported protocol: ${u.protocol}`,
        };
      }
    } catch {
      return {
        url,
        finalUrl: url,
        httpStatus: 0,
        html: null,
        fetchedAt,
        extracted: { ...EMPTY_EXTRACTED },
        notes: "invalid url",
      };
    }

    const robots = await checkRobots(url);
    if (!robots.allowed) {
      return {
        url,
        finalUrl: url,
        httpStatus: 0,
        html: null,
        fetchedAt,
        // Sentinel agreed with the orchestrator — the cron route filters on this.
        extracted: { ...EMPTY_EXTRACTED, title: "blocked-by-robots" },
        notes: robots.notes,
      };
    }

    const outcome = await fetchWithCaps(url);
    if (!outcome.ok) {
      return {
        url,
        finalUrl: outcome.finalUrl ?? url,
        httpStatus: outcome.status,
        html: null,
        fetchedAt,
        extracted: { ...EMPTY_EXTRACTED },
        notes: outcome.notes,
      };
    }

    let extracted: Extracted;
    try {
      extracted = extract(outcome.html, outcome.finalUrl);
    } catch (err) {
      // Cheerio is robust to malformed HTML, but defensive belt-and-braces.
      return {
        url,
        finalUrl: outcome.finalUrl,
        httpStatus: outcome.status,
        html: outcome.html,
        fetchedAt,
        extracted: { ...EMPTY_EXTRACTED },
        notes: `parse error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    return {
      url,
      finalUrl: outcome.finalUrl,
      httpStatus: outcome.status,
      html: outcome.html,
      fetchedAt,
      extracted,
      notes: "",
    };
  }
}
