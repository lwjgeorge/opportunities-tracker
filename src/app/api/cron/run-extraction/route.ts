import { and, desc, eq, notExists, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { emailEvents } from "@/db/schema";
import {
  extractionRuns,
  relationshipCandidates,
  stageSignalCandidates,
} from "@/db/extraction-schema";
import { createClaudeLlmExtractor } from "@/lib/llm/providers/claude";
import type { EmailExtractionInput, LlmExtractor } from "@/lib/llm/types";

/**
 * Anthropic SDK is Node-only (depends on `stream`, `http`, etc.). The Edge
 * runtime would refuse to bundle it.
 */
export const runtime = "nodejs";

/** Never cache; this is a cron-fed mutation endpoint. */
export const dynamic = "force-dynamic";

/** Hard cap per invocation — Vercel cron windows are small. */
const MAX_BATCH = 20;

/**
 * Stage signals below this confidence are dropped. Above it, a row lands in
 * `stage_signal_candidates` for human review.
 */
const STAGE_SIGNAL_CONFIDENCE_THRESHOLD = 0.7;

type ExtractionResponse =
  | { ok: true; skipped: true; reason: string }
  | {
      ok: true;
      processed: number;
      succeeded: number;
      failed: number;
      candidatesInserted: number;
      stageSignalsInserted: number;
    };

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

/**
 * Lazy db import — see `refresh-companies/route.ts` for the same trick.
 * `src/db/index.ts` throws when `DATABASE_URL` is missing; deferring the
 * import keeps `next build` green in CI.
 */
async function getDb() {
  const mod = await import("@/db");
  return mod.db;
}

type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * Pick email_events that have no successful extraction_run yet. Newest first
 * so a backlog still gets fresh data fast.
 */
async function pickPendingEmails(db: Db) {
  return db
    .select({
      id: emailEvents.id,
      sender: emailEvents.sender,
      subject: emailEvents.subject,
      sentAt: emailEvents.sentAt,
    })
    .from(emailEvents)
    .where(
      notExists(
        db
          .select({ one: sql<number>`1` })
          .from(extractionRuns)
          .where(
            and(
              eq(extractionRuns.source, "email_event"),
              eq(extractionRuns.sourceId, emailEvents.id),
              eq(extractionRuns.status, "success"),
            ),
          ),
      ),
    )
    .orderBy(desc(emailEvents.sentAt))
    .limit(MAX_BATCH);
}

type PendingEmail = Awaited<ReturnType<typeof pickPendingEmails>>[number];

function toExtractionInput(row: PendingEmail): EmailExtractionInput {
  return {
    sender: row.sender,
    subject: row.subject,
    // Body is currently null — the Gmail poller fetches metadata-only.
    // When that changes, extract from `email_events.raw` here.
    bodyText: null,
    sentAt: row.sentAt,
  };
}

/**
 * Run extraction for one email and persist results. All work for a single
 * email lands or fails together — we don't wrap in a transaction because
 * Neon HTTP doesn't support them and the worst case (partial insert on a
 * server crash mid-loop) just means a duplicate run on retry, which the
 * cron's "no successful run yet" filter handles correctly.
 */
async function processOne(
  db: Db,
  extractor: LlmExtractor,
  row: PendingEmail,
): Promise<{ candidatesInserted: number; stageSignalsInserted: number }> {
  const startedAt = new Date();
  try {
    const extraction = await extractor.extractFromEmail(toExtractionInput(row));

    await db.insert(extractionRuns).values({
      source: "email_event",
      sourceId: row.id,
      modelName: extractor.name,
      status: "success",
      startedAt,
      completedAt: new Date(),
    });

    let candidatesInserted = 0;
    if (extraction.relationships.length > 0) {
      const inserted = await db
        .insert(relationshipCandidates)
        .values(
          extraction.relationships.map((r) => ({
            source: "email_event" as const,
            sourceId: row.id,
            relation: r.relation,
            contactName: r.contact.name,
            contactEmail: r.contact.email ?? null,
            companyName: r.company?.name ?? null,
            role: r.role ?? null,
            confidence: r.confidence,
            sourceQuote: r.sourceQuote,
          })),
        )
        .returning({ id: relationshipCandidates.id });
      candidatesInserted = inserted.length;
    }

    let stageSignalsInserted = 0;
    if (
      extraction.stageSignal &&
      extraction.stageSignal.confidence >= STAGE_SIGNAL_CONFIDENCE_THRESHOLD
    ) {
      const inserted = await db
        .insert(stageSignalCandidates)
        .values({
          source: "email_event",
          sourceId: row.id,
          toStage: extraction.stageSignal.toStage,
          confidence: extraction.stageSignal.confidence,
          reason: extraction.stageSignal.reason,
        })
        .returning({ id: stageSignalCandidates.id });
      stageSignalsInserted = inserted.length;
    }

    return { candidatesInserted, stageSignalsInserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(extractionRuns).values({
      source: "email_event",
      sourceId: row.id,
      modelName: extractor.name,
      status: "failure",
      errorMessage: message,
      startedAt,
      completedAt: new Date(),
    });
    throw err;
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  // Feature flag — cheap LLM calls add up if left running unattended. The
  // flag is the single switch that gates real API spend; toggle by setting
  // LLM_EXTRACTION_ENABLED=1 in the deployed env.
  if (process.env.LLM_EXTRACTION_ENABLED !== "1") {
    const body: ExtractionResponse = {
      ok: true,
      skipped: true,
      reason: "LLM_EXTRACTION_ENABLED not set",
    };
    return NextResponse.json(body);
  }

  try {
    const db = await getDb();
    const extractor = createClaudeLlmExtractor();
    const pending = await pickPendingEmails(db);

    let succeeded = 0;
    let failed = 0;
    let candidatesInserted = 0;
    let stageSignalsInserted = 0;

    for (const row of pending) {
      try {
        const result = await processOne(db, extractor, row);
        succeeded++;
        candidatesInserted += result.candidatesInserted;
        stageSignalsInserted += result.stageSignalsInserted;
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[cron/run-extraction] email_event ${row.id} failed:`,
          message,
        );
        // Continue with the next email; the failure is already audited.
      }
    }

    const body: ExtractionResponse = {
      ok: true,
      processed: pending.length,
      succeeded,
      failed,
      candidatesInserted,
      stageSignalsInserted,
    };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/run-extraction] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
