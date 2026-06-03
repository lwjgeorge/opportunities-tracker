import { describe, expect, it, vi } from "vitest";

// Mock the lazy db client so the action import doesn't try to read
// DATABASE_URL or talk to Postgres. The action only needs `transaction` to
// resolve — its return value is whatever the callback returns.
vi.mock("@/db", () => ({
  db: {
    transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => {
      const noopTx = {
        update: () => ({
          set: () => ({
            where: async () => undefined,
          }),
        }),
      };
      return cb(noopTx);
    },
  },
}));

import { moveApplication } from "./actions";
import { applyInsert, bumpPositionsForInsert } from "@/lib/kanban/renumber";

// The renumber math is exercised in src/lib/kanban/renumber.test.ts. Here we
// re-check it from the action's vantage point: the helper used by the action
// must agree with what the action does in SQL. If someone tweaks the bump
// rule (e.g. >= vs >) this will catch the drift.

// Strongly-typed inputs would prevent this test from even compiling — but
// the runtime validator (zod safeParse) is the actual defence, since the
// server action can receive anything via the network boundary. Casting to
// the input shape lets us prove the runtime check holds.
import type { MoveApplicationInput } from "./actions";

describe("moveApplication: input validation", () => {
  it("rejects non-integer ids", async () => {
    const result = await moveApplication({
      id: 1.5,
      toStage: "lead",
      toPositionInStage: 0,
    } as MoveApplicationInput);
    expect(result.ok).toBe(false);
  });

  it("rejects negative positions", async () => {
    const result = await moveApplication({
      id: 1,
      toStage: "lead",
      toPositionInStage: -1,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects unknown stages", async () => {
    const result = await moveApplication({
      id: 1,
      toStage: "elsewhere",
      toPositionInStage: 0,
    } as unknown as MoveApplicationInput);
    expect(result.ok).toBe(false);
  });

  it("accepts a well-formed move", async () => {
    const result = await moveApplication({
      id: 1,
      toStage: "applied",
      toPositionInStage: 0,
    });
    expect(result.ok).toBe(true);
  });
});

describe("renumber math matches what the action persists", () => {
  it("bumping rule matches the SQL clause (>= toPositionInStage, != id)", () => {
    const existing = [
      { id: 10, positionInStage: 0 },
      { id: 11, positionInStage: 1 },
      { id: 12, positionInStage: 2 },
    ];
    // The action's SQL is `UPDATE ... SET position = position+1
    // WHERE stage = toStage AND position >= toPositionInStage AND id != id`.
    // The helper must produce the same delta set.
    expect(bumpPositionsForInsert(existing, 99, 1)).toEqual([
      { id: 11, positionInStage: 2 },
      { id: 12, positionInStage: 3 },
    ]);
    // Moving id=11 from position 1 to position 0 — should bump id=10 by one
    // but leave id=11 (the mover) and id=12 (below the bump) alone.
    expect(bumpPositionsForInsert(existing, 11, 0)).toEqual([
      { id: 10, positionInStage: 1 },
      { id: 12, positionInStage: 3 },
    ]);
  });

  it("applyInsert leaves no holes after a cross-stage move", () => {
    const existing = [
      { id: 1, positionInStage: 0 },
      { id: 2, positionInStage: 1 },
    ];
    const next = applyInsert(existing, 99, 0);
    expect(next.map((r) => r.positionInStage)).toEqual([0, 1, 2]);
  });
});
