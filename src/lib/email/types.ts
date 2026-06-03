/**
 * Provider-agnostic email ingest contract.
 *
 * The orchestrator (a polling cron route) is the only thing that knows about
 * provider implementations; everything downstream — dedupe, persistence, LLM
 * extraction — works off {@link FetchedMessage} and never imports a provider
 * SDK directly.
 *
 * To add a second provider (Postmark, IMAP, etc.):
 *  1. Create `src/lib/email/providers/<name>.ts` exporting a factory that
 *     returns an {@link EmailProvider}.
 *  2. Pick a stable string for {@link EmailProvider.name} and add it to the
 *     `email_provider` pg enum in `src/db/schema.ts` (separate migration).
 *  3. Use the provider's native message id as `providerMessageId`; the
 *     `(provider, provider_message_id)` unique index in the DB handles dedupe.
 *  4. See `src/lib/email/README.md` for the longer write-up.
 */

/**
 * Discriminator union of all wired-up providers. Mirrors the
 * `email_provider` pg enum in `src/db/schema.ts`; keep in sync.
 */
export type EmailProviderName = "gmail";

/**
 * Allowlist passed to the provider. The provider is expected to translate
 * these into native filters (Gmail: `from:(...)`) so we never download the
 * whole inbox.
 *
 * Values are case-insensitive; providers should lower-case before comparing.
 *  - `domains`: bare domains, e.g. `"example.com"` (no leading `@`).
 *  - `addresses`: full addresses, e.g. `"recruiter@example.com"`.
 */
export type Allowlist = {
  domains: string[];
  addresses: string[];
};

/**
 * Minimal, provider-agnostic shape persisted to `email_events`.
 *
 * `rawBlob` is JSON-serialisable and stored verbatim on `email_events.raw`.
 * Downstream consumers (LLM extraction, audit) read it; the provider chooses
 * what to put in there. Defaults to provider response shape.
 */
export type FetchedMessage = {
  /** Provider-native message id (e.g. Gmail's `id`). */
  providerMessageId: string;
  /** Provider-native thread id, or null if the provider has no concept. */
  threadId: string | null;
  /**
   * Sender, ideally already-parsed to the bare address
   * (e.g. `"alice@example.com"`), but falling back to the raw `From:` header
   * is acceptable — downstream code should not assume one format. Normalise
   * to lower-case where possible.
   */
  sender: string;
  subject: string | null;
  /** When the email was sent, per the provider. */
  sentAt: Date;
  /** Opaque provider payload — see comment above. */
  rawBlob: unknown;
};

export type ListNewMessagesOptions = {
  /**
   * Provider-native marker (Gmail historyId, Postmark cursor, etc.) returned
   * by an earlier call to {@link EmailProvider.latestMarker}. When omitted,
   * the provider falls back to a recent-window query (Gmail: `newer_than:1d`).
   *
   * Persistence of this marker between polls is deferred — see the
   * `last_polled_marker` note in `src/lib/email/README.md`. For now, callers
   * pass `undefined` and rely on the DB unique-index dedupe.
   */
  sinceMarker?: string;
  allowlist: Allowlist;
};

export interface EmailProvider {
  readonly name: EmailProviderName;

  /**
   * Returns messages newer than `sinceMarker` (or, if omitted, the provider's
   * default recent window) that match the allowlist. Implementations cap the
   * page size; the cron loop does not paginate further on its own.
   *
   * If the allowlist is empty (no domains AND no addresses), implementations
   * MUST return an empty array — we never slurp the whole inbox.
   */
  listNewMessages(opts: ListNewMessagesOptions): Promise<FetchedMessage[]>;

  /**
   * Fetch a single message by provider id. Used for retries and for refetching
   * a body when metadata-only ingest was the default.
   */
  getMessage(id: string): Promise<FetchedMessage>;

  /**
   * Returns the latest position marker for the next poll, or null if the
   * provider has nothing to anchor on (empty inbox, no permission, etc.).
   *
   * Today this is unused — see the marker-persistence note in
   * `src/lib/email/README.md`.
   */
  latestMarker(): Promise<string | null>;
}
