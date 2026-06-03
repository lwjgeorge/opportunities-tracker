import { describe, expect, it } from "vitest";

import { applyInsert, bumpPositionsForInsert } from "./renumber";

describe("bumpPositionsForInsert", () => {
  it("returns nothing when inserting past the end", () => {
    const existing = [
      { id: 1, positionInStage: 0 },
      { id: 2, positionInStage: 1 },
    ];
    expect(bumpPositionsForInsert(existing, 99, 5)).toEqual([]);
  });

  it("bumps every existing row at >= insert position", () => {
    const existing = [
      { id: 1, positionInStage: 0 },
      { id: 2, positionInStage: 1 },
      { id: 3, positionInStage: 2 },
    ];
    expect(bumpPositionsForInsert(existing, 99, 1)).toEqual([
      { id: 2, positionInStage: 2 },
      { id: 3, positionInStage: 3 },
    ]);
  });

  it("excludes the inserted item from the bump list", () => {
    const existing = [
      { id: 1, positionInStage: 0 },
      { id: 2, positionInStage: 1 },
      { id: 3, positionInStage: 2 },
    ];
    // Item 2 is being moved to position 0 — itself should not appear.
    expect(bumpPositionsForInsert(existing, 2, 0)).toEqual([
      { id: 1, positionInStage: 1 },
      { id: 3, positionInStage: 3 },
    ]);
  });

  it("leaves items below the insertion point alone", () => {
    const existing = [
      { id: 10, positionInStage: 0 },
      { id: 11, positionInStage: 1 },
      { id: 12, positionInStage: 2 },
      { id: 13, positionInStage: 3 },
    ];
    expect(bumpPositionsForInsert(existing, 99, 2)).toEqual([
      { id: 12, positionInStage: 3 },
      { id: 13, positionInStage: 4 },
    ]);
  });

  it("throws when given a negative insert position", () => {
    expect(() => bumpPositionsForInsert([], 1, -1)).toThrow(/insertedPosition/);
  });

  it("is a no-op against an empty stage", () => {
    expect(bumpPositionsForInsert([], 1, 0)).toEqual([]);
  });
});

describe("applyInsert", () => {
  it("packs positions starting at 0 with no gaps", () => {
    const existing = [
      { id: 1, positionInStage: 0 },
      { id: 2, positionInStage: 1 },
    ];
    const next = applyInsert(existing, 99, 1);
    expect(next.map((n) => n.positionInStage)).toEqual([0, 1, 2]);
  });

  it("places the new item at the requested index", () => {
    const existing = [
      { id: 1, positionInStage: 0 },
      { id: 2, positionInStage: 1 },
      { id: 3, positionInStage: 2 },
    ];
    const next = applyInsert(existing, 99, 1);
    expect(next).toEqual([
      { id: 1, positionInStage: 0 },
      { id: 99, positionInStage: 1 },
      { id: 2, positionInStage: 2 },
      { id: 3, positionInStage: 3 },
    ]);
  });

  it("clamps target index to the end of the list", () => {
    const existing = [
      { id: 1, positionInStage: 0 },
      { id: 2, positionInStage: 1 },
    ];
    const next = applyInsert(existing, 99, 100);
    expect(next[next.length - 1]).toEqual({ id: 99, positionInStage: 2 });
  });

  it("handles intra-stage reorder (moving an existing item)", () => {
    const existing = [
      { id: 1, positionInStage: 0 },
      { id: 2, positionInStage: 1 },
      { id: 3, positionInStage: 2 },
    ];
    // Move id=3 from position 2 to position 0.
    const next = applyInsert(existing, 3, 0);
    expect(next).toEqual([
      { id: 3, positionInStage: 0 },
      { id: 1, positionInStage: 1 },
      { id: 2, positionInStage: 2 },
    ]);
  });

  it("handles insertion into an empty stage", () => {
    expect(applyInsert([], 5, 0)).toEqual([{ id: 5, positionInStage: 0 }]);
  });
});
