import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Persisted OAuth credentials for third-party providers we poll on a cron
 * (today: Google for Gmail readonly). One row per (provider, account_email).
 *
 * The refresh_token is the long-lived secret; access_token is an optional
 * cache so we don't refresh on every poll. `expires_at` tells the consumer
 * when the cached access token must be refreshed.
 *
 * Lives in its own schema file so the scope of "auth credentials" stays
 * obvious and so the main `schema.ts` does not bloat with integration tables.
 */
export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: serial("id").primaryKey(),
    /** Stable provider key, e.g. "google". */
    provider: text("provider").notNull(),
    /** Account email this credential is bound to. Optional for display. */
    accountEmail: text("account_email"),
    /** Long-lived refresh token. The secret. */
    refreshToken: text("refresh_token").notNull(),
    /** Optional cached access token. May be null if always refreshed on use. */
    accessToken: text("access_token"),
    /** Expiry of the cached access token, if any. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Space-separated scopes granted (raw from the token response). */
    scopes: text("scopes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("oauth_tokens_provider_account_idx").on(
      t.provider,
      t.accountEmail,
    ),
  ],
);

export type OauthToken = typeof oauthTokens.$inferSelect;
export type NewOauthToken = typeof oauthTokens.$inferInsert;
