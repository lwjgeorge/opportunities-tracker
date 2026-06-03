import { google, type gmail_v1 } from "googleapis";

import type {
  Allowlist,
  EmailProvider,
  FetchedMessage,
  ListNewMessagesOptions,
} from "@/lib/email/types";

/**
 * Cap on messages fetched per poll. Keeps the cron route bounded; if the
 * inbox is busier than this in a 5-min window we will catch up on the next
 * tick. The dedupe unique-index makes catching up safe.
 */
const MAX_MESSAGES_PER_POLL = 50;

/**
 * Recent-window fallback used when no `sinceMarker` is provided. Gmail's
 * query language supports `newer_than:Nd|h|m`; we use `1d` so a missed poll
 * cycle (a few hours) still gets backfilled.
 *
 * This is the "round-1 mode": we lean on the DB unique-index for dedupe and
 * defer building a `last_polled_marker` table. See `src/lib/email/README.md`.
 */
const DEFAULT_RECENT_WINDOW = "newer_than:1d";

/**
 * Why metadata-only by default?
 *
 *   `users.messages.get` with `format: 'metadata'` returns headers
 *   (From, Subject, Date, etc.) without the message body. That keeps our
 *   Gmail API quota usage low — we ingest *every* allowlisted message but
 *   only download what we need to dedupe and present.
 *
 * If/when LLM extraction is wired up and needs the body, the orchestrator
 * should switch this to `'full'` (or refetch on demand via `getMessage`).
 * The provider stores the full API response on `rawBlob`, so re-running
 * extraction over historical rows means refetching the body for those ids
 * — there is no body in `rawBlob` today.
 */
const DEFAULT_GET_FORMAT: "metadata" | "full" = "metadata";

type RequiredGoogleEnv = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

function readGoogleEnv(): RequiredGoogleEnv {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  // Runtime failure (per scope brief) — do NOT do this at module top level,
  // otherwise `next build` evaluates this file and the build breaks on a CI
  // box without these secrets.
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail provider missing env vars: " +
        [
          !clientId && "GOOGLE_CLIENT_ID",
          !clientSecret && "GOOGLE_CLIENT_SECRET",
          !refreshToken && "GOOGLE_REFRESH_TOKEN",
        ]
          .filter(Boolean)
          .join(", "),
    );
  }

  return { clientId, clientSecret, refreshToken };
}

/**
 * Build the Gmail filter expression `from:(...)` from the allowlist. Returns
 * `null` when the allowlist is empty so the caller can short-circuit; we
 * never want to issue `users.messages.list` without a `from:` constraint.
 *
 * Gmail query syntax:
 *   - `from:@example.com` matches any sender on that domain.
 *   - `from:recruiter@example.com` matches an exact address.
 *   - `from:(a OR b OR c)` groups alternatives.
 */
export function buildFromQuery(allowlist: Allowlist): string | null {
  const domainTerms = allowlist.domains
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0)
    .map((d) => `@${d}`);

  const addressTerms = allowlist.addresses
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length > 0);

  const all = [...domainTerms, ...addressTerms];
  if (all.length === 0) return null;

  // Single term doesn't need parens, but Gmail accepts them either way.
  return `from:(${all.join(" OR ")})`;
}

/**
 * Pluck a header value (case-insensitive) from a Gmail metadata response.
 */
function header(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  for (const h of headers) {
    if (h.name && h.name.toLowerCase() === target) {
      return h.value ?? null;
    }
  }
  return null;
}

/**
 * Parse an RFC 5322 `From:` header down to the bare address.
 * `"Alice <alice@example.com>"` -> `"alice@example.com"`. If we can't find
 * angle brackets, fall back to the raw value lower-cased. Downstream code
 * should not assume one format; this is best-effort.
 */
function parseSender(raw: string | null): string {
  if (!raw) return "";
  const match = raw.match(/<([^>]+)>/);
  if (match && match[1]) return match[1].trim().toLowerCase();
  return raw.trim().toLowerCase();
}

/**
 * Turn a Gmail metadata response into our provider-agnostic shape. Throws
 * if mandatory fields are missing — that should never happen for a real
 * Gmail message, but we guard so callers don't get silent empty rows.
 */
function toFetchedMessage(msg: gmail_v1.Schema$Message): FetchedMessage {
  if (!msg.id) {
    throw new Error("Gmail message missing id");
  }
  const headers = msg.payload?.headers;
  const sender = parseSender(header(headers, "From"));
  const subject = header(headers, "Subject");

  // Prefer Gmail's internalDate (epoch ms, set by Google's MTA) over the
  // `Date:` header — internalDate is what the inbox actually sorts by and
  // can't be spoofed by the sender.
  let sentAt: Date;
  if (msg.internalDate) {
    const ms = Number.parseInt(msg.internalDate, 10);
    sentAt = Number.isFinite(ms) ? new Date(ms) : new Date(0);
  } else {
    const dateHeader = header(headers, "Date");
    sentAt = dateHeader ? new Date(dateHeader) : new Date(0);
  }

  return {
    providerMessageId: msg.id,
    threadId: msg.threadId ?? null,
    sender,
    subject,
    sentAt,
    rawBlob: msg,
  };
}

/**
 * Lazily construct the OAuth2 client and bind it to the Gmail API. We do
 * this inside the factory (not at module load) so `next build` works on a
 * machine without Google secrets.
 */
function buildGmailClient(): gmail_v1.Gmail {
  const env = readGoogleEnv();
  const oauth2 = new google.auth.OAuth2(env.clientId, env.clientSecret);
  oauth2.setCredentials({ refresh_token: env.refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

export function createGmailProvider(): EmailProvider {
  // Memoise the client across calls within the same request, but build it
  // lazily on first use.
  let gmailClient: gmail_v1.Gmail | null = null;
  const client = (): gmail_v1.Gmail => {
    if (!gmailClient) gmailClient = buildGmailClient();
    return gmailClient;
  };

  async function getMessage(id: string): Promise<FetchedMessage> {
    const res = await client().users.messages.get({
      userId: "me",
      id,
      format: DEFAULT_GET_FORMAT,
    });
    return toFetchedMessage(res.data);
  }

  async function listNewMessages(
    opts: ListNewMessagesOptions,
  ): Promise<FetchedMessage[]> {
    const fromQuery = buildFromQuery(opts.allowlist);
    if (!fromQuery) {
      // Empty allowlist: deliberately ingest nothing. Never slurp the inbox.
      return [];
    }

    // `sinceMarker` is reserved for the future marker-table — see
    // `latestMarker()` and the README. Until that lands we lean on the
    // recent-window query + DB unique-index dedupe.
    const q = `${fromQuery} ${DEFAULT_RECENT_WINDOW}`;

    const listRes = await client().users.messages.list({
      userId: "me",
      q,
      maxResults: MAX_MESSAGES_PER_POLL,
    });

    const ids = (listRes.data.messages ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string");

    if (ids.length === 0) return [];

    // Sequential is fine at maxResults=50 and avoids hammering Gmail's
    // per-user rate limit. If we hit ceiling we can parallelise with a
    // concurrency limiter later.
    const out: FetchedMessage[] = [];
    for (const id of ids) {
      try {
        const msg = await getMessage(id);
        out.push(msg);
      } catch (err) {
        // One bad message shouldn't fail the whole poll. Log and move on;
        // the cron tick will retry next cycle (the failing id won't be in
        // the DB yet, so the dedupe index lets us retry).
        console.error(
          `[gmail] failed to fetch message id=${id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return out;
  }

  async function latestMarker(): Promise<string | null> {
    // Returning the current historyId would be the right call once we have
    // a `last_polled_marker` table to persist it. Until then this is unused
    // and we return null so callers don't accidentally rely on it.
    return null;
  }

  return {
    name: "gmail" as const,
    listNewMessages,
    getMessage,
    latestMarker,
  };
}
