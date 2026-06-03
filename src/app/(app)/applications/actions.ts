"use server";

import { and, gte, ne, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { applications } from "@/db/schema";
import { APPLICATION_STAGES } from "@/lib/types";

const moveInput = z.object({
  id: z.number().int().positive(),
  toStage: z.enum(APPLICATION_STAGES),
  toPositionInStage: z.number().int().min(0),
});

export type MoveApplicationInput = z.infer<typeof moveInput>;

export type MoveApplicationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Persist a kanban drop. Two writes inside one Drizzle transaction:
 *   1. Bump positionInStage by +1 for every row in `toStage` whose current
 *      position is >= the requested target, EXCEPT the row being moved.
 *   2. Update the moved row's stage and position.
 *
 * If the DB is unavailable (DATABASE_URL unset, network fail), we return
 * `{ ok: false, error }` so the client can revert the optimistic move
 * without crashing. In mock-fallback mode the page never wires real ids in
 * the first place, but we still surface a clean error here in case a stale
 * client triggers it.
 */
export async function moveApplication(
  input: MoveApplicationInput,
): Promise<MoveApplicationResult> {
  const parsed = moveInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input: ${parsed.error.message}`,
    };
  }
  const { id, toStage, toPositionInStage } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      // Step 1: bump siblings already at or past the insertion point.
      await tx
        .update(applications)
        .set({
          positionInStage: sql`${applications.positionInStage} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(applications.stage, toStage),
            gte(applications.positionInStage, toPositionInStage),
            ne(applications.id, id),
          ),
        );

      // Step 2: place the moved row at the target slot.
      await tx
        .update(applications)
        .set({
          stage: toStage,
          positionInStage: toPositionInStage,
          updatedAt: new Date(),
        })
        .where(eq(applications.id, id));
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
