/**
 * Pure helpers for keeping kanban `positionInStage` integers packed.
 *
 * The DB stores `positionInStage` as a plain integer (see schema), so when a
 * card is dropped at position N in a stage, every existing row in that stage
 * at position >= N needs to bump up by one to make room. This module owns
 * that math so the server action stays thin and the logic is unit-testable.
 *
 * Conventions:
 * - Positions are zero-indexed. 0 = top of column.
 * - The "inserted" card is identified by id and excluded from the bump so
 *   moves within the same stage don't double-shift the row being moved.
 */

export interface PositionedItem {
  id: number;
  positionInStage: number;
}

export interface BumpedPosition {
  id: number;
  positionInStage: number;
}

/**
 * Given the existing items already in the destination stage and an insertion
 * point, return the set of items whose `positionInStage` must change (and
 * what their new positions are). The returned list excludes:
 *   - The item being inserted (we set its position separately).
 *   - Items whose position would not change (no-op writes).
 *
 * Behaviour summary:
 *   - Items at position < insertedPosition stay where they are.
 *   - Items at position >= insertedPosition get bumped by +1.
 *   - The inserted item itself (matched by id) is filtered out of the bump
 *     list so the caller can update it in a single UPDATE alongside the
 *     stage/position write.
 */
export function bumpPositionsForInsert(
  existing: readonly PositionedItem[],
  insertedId: number,
  insertedPosition: number,
): BumpedPosition[] {
  if (insertedPosition < 0) {
    throw new Error(
      `insertedPosition must be >= 0, got ${insertedPosition}`,
    );
  }
  const bumped: BumpedPosition[] = [];
  for (const item of existing) {
    if (item.id === insertedId) continue;
    if (item.positionInStage < insertedPosition) continue;
    bumped.push({
      id: item.id,
      positionInStage: item.positionInStage + 1,
    });
  }
  return bumped;
}

/**
 * Convenience: full resulting layout of a stage after inserting / moving an
 * item to `insertedPosition`. Useful for client-side optimistic rendering
 * without re-running the server logic. Output is sorted by `positionInStage`
 * ascending and items are *packed* (no gaps) starting at 0.
 */
export function applyInsert(
  existing: readonly PositionedItem[],
  insertedId: number,
  insertedPosition: number,
): PositionedItem[] {
  const withoutMoved = existing
    .filter((item) => item.id !== insertedId)
    .sort((a, b) => a.positionInStage - b.positionInStage);
  // Clamp insert position to [0, withoutMoved.length].
  const targetIndex = Math.min(
    Math.max(insertedPosition, 0),
    withoutMoved.length,
  );
  const next: PositionedItem[] = [];
  for (let i = 0; i < withoutMoved.length + 1; i++) {
    if (i < targetIndex) {
      next.push({
        id: withoutMoved[i].id,
        positionInStage: i,
      });
    } else if (i === targetIndex) {
      next.push({ id: insertedId, positionInStage: i });
    } else {
      next.push({
        id: withoutMoved[i - 1].id,
        positionInStage: i,
      });
    }
  }
  return next;
}
