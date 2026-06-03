# Email ingest

Polling-based email ingest with a provider-agnostic contract.

> **This is polling, not webhook.** A Vercel cron hits `/api/cron/poll-gmail`
> on a schedule (see `vercel.json`) and pulls messages that match the
> allowlist. We do not subscribe to Gmail push notifications.

## Contract: `EmailProvider`

See [`types.ts`](./types.ts). The shape:

```ts
interface EmailProvider {
  readonly name: "gmail" | ...;
  listNewMessages(opts): Promise<FetchedMessage[]>;
  getMessage(id): Promise<FetchedMessage>;
  latestMarker(): Promise<string | null>;
}
```

`FetchedMessage` is the provider-agnostic shape persisted to `email_events`.
The cron route (the only orchestrator today) reads the allowlist from
`email_allowlist`, asks the provider for new messages, and bulk-inserts with
`ON CONFLICT DO NOTHING` on the `(provider, provider_message_id)` unique
index.

## Allowlist rule (load-bearing)

We never slurp the whole inbox. If the allowlist is empty (no domains AND no
addresses), the provider's `listNewMessages` MUST return `[]`. Every provider
implementation must enforce this; the cron route enforces it again as a
belt-and-braces check.

## Idempotent writes

The unique index `email_events_provider_msg_idx` on
`(provider, provider_message_id)` is the dedupe target. Use
`.onConflictDoNothing({ target: [emailEvents.provider, emailEvents.providerMessageId] })`
when inserting; never look-then-insert.

## Adding a second provider

1. **Create the file**: `src/lib/email/providers/<name>.ts` exporting a
   factory `createXProvider(): EmailProvider`.
2. **Reserve the discriminator**: add the string to the `email_provider` pg
   enum in `src/db/schema.ts` AND to `EmailProviderName` in `types.ts`, then
   generate a migration with `pnpm db:generate`.
3. **Translate the allowlist natively**: the provider takes
   `{ domains, addresses }` and must turn that into a server-side filter
   (Gmail uses `from:(...)`). Filtering client-side after downloading
   defeats the point.
4. **Pick a stable `providerMessageId`**: must be unique within that
   provider and survive a refetch. The DB unique index does the dedupe.
5. **Stash the raw payload on `rawBlob`**: downstream LLM extraction needs
   to be able to re-read whatever you got back from the API.

## Marker persistence (deferred)

`listNewMessages` accepts an optional `sinceMarker` and `EmailProvider`
exposes `latestMarker()`. **Neither is wired up today.** The Gmail provider
uses `newer_than:1d` as its recent-window query and relies on the DB
unique-index to make catching up safe (re-polled messages just get
`onConflictDoNothing`-skipped).

When you want to extend this:

- Add a `last_polled_marker` table keyed by `provider` with a `marker text`
  column and `updated_at`.
- After a successful poll, persist `provider.latestMarker()` into that table.
- On the next poll, read that value and pass it as `sinceMarker`.

For Gmail, the natural marker is `historyId` (use `users.history.list` with
`startHistoryId`). For Postmark/IMAP it'd be a paging cursor or a UID.

## Body fetch (deferred)

The Gmail provider fetches with `format: 'metadata'` so it only downloads
headers — cheap on quota, enough to dedupe and present. **No body is stored
on `rawBlob` today.** When LLM extraction is wired up:

- Either flip the default `getMessage` format to `'full'`, or
- Add a separate "enrich" worker that calls `provider.getMessage(id)` on
  rows that need a body, with `format: 'full'`.

The latter keeps the polling loop cheap and lets the enrich pass be its own
rate-limited concern.
