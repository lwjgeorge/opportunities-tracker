import { NextResponse } from "next/server";

import { db } from "@/db";
import { emailAllowlist, emailEvents } from "@/db/schema";
import { createGmailProvider } from "@/lib/email/providers/gmail";
import type { Allowlist, FetchedMessage } from "@/lib/email/types";

/**
 * Always run this on the Node.js runtime — googleapis depends on Node core
 * modules (http, stream) that the Edge runtime doesn't expose.
 */
export const runtime = "nodejs";

/**
 * Never cache; this is a cron-fed mutation endpoint.
 */
export const dynamic = "force-dynamic";

type PollResponse = {
  ok: true;
  fetched: number;
  inserted: number;
  skipped: number;
};

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Defensive: if the secret isn't set, refuse to run rather than running
    // wide open. Better a paged 500 than silent leak.
    return false;
  }
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

async function loadAllowlist(): Promise<Allowlist> {
  const rows = await db
    .select({ kind: emailAllowlist.kind, value: emailAllowlist.value })
    .from(emailAllowlist);

  const domains: string[] = [];
  const addresses: string[] = [];
  for (const row of rows) {
    if (row.kind === "domain") domains.push(row.value);
    else if (row.kind === "address") addresses.push(row.value);
  }
  return { domains, addresses };
}

async function persistMessages(messages: FetchedMessage[]): Promise<number> {
  if (messages.length === 0) return 0;

  // One bulk insert. The unique index on (provider, provider_message_id)
  // is the dedupe target — Drizzle picks it up via the columns we pass.
  // `.returning({ id })` lets us count exactly how many rows actually
  // landed (conflicts get filtered out by ON CONFLICT DO NOTHING).
  const inserted = await db
    .insert(emailEvents)
    .values(
      messages.map((m) => ({
        provider: "gmail" as const,
        providerMessageId: m.providerMessageId,
        threadId: m.threadId,
        sender: m.sender,
        subject: m.subject,
        sentAt: m.sentAt,
        // `raw` is JSONB; the FetchedMessage.rawBlob is the gmail v1 message.
        raw: m.rawBlob as object,
      })),
    )
    .onConflictDoNothing({
      target: [emailEvents.provider, emailEvents.providerMessageId],
    })
    .returning({ id: emailEvents.id });

  return inserted.length;
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) return unauthorized();

  try {
    const allowlist = await loadAllowlist();

    // No allowlist => nothing to ingest. Don't even build a Gmail client.
    if (allowlist.domains.length === 0 && allowlist.addresses.length === 0) {
      const body: PollResponse = {
        ok: true,
        fetched: 0,
        inserted: 0,
        skipped: 0,
      };
      return NextResponse.json(body);
    }

    const provider = createGmailProvider();
    const messages = await provider.listNewMessages({ allowlist });
    const inserted = await persistMessages(messages);

    const body: PollResponse = {
      ok: true,
      fetched: messages.length,
      inserted,
      skipped: messages.length - inserted,
    };
    return NextResponse.json(body);
  } catch (err) {
    // Return non-2xx so Vercel cron flags + retries on the next tick.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/poll-gmail] failed:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
