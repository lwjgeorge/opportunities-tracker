"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Application, ApplicationStage, Company } from "@/lib/types";
import { ORDERED_STAGES } from "@/lib/stages";
import { moveApplication } from "@/app/(app)/applications/actions";
import { Column } from "./Column";
import { Card } from "./Card";

interface BoardProps {
  initialApplications: Application[];
  companies: Company[];
  /**
   * Whether the data on this board came from the real DB or the mock fallback.
   * When `"mock"`, drag/drop is a local-only no-op — there's no DB to write to,
   * and the ids are deterministic strings that won't parse to ints.
   */
  source: "db" | "mock";
}

type DragData =
  | { type: "application"; stage: ApplicationStage }
  | { type: "column"; stage: ApplicationStage };

/**
 * Top-level kanban board. Owns the local applications array and handles
 * drag-end logic for both intra-column reorder and cross-column moves.
 *
 * Persistence path (when `source === "db"`): on drop, we optimistically
 * mutate local state, fire the `moveApplication` server action, and revert
 * the local state if the action returns `{ ok: false }`. The optimistic
 * write is what makes the kanban feel instant; the revert is what stops
 * stale state silently piling up on a transient DB error.
 */
export function Board({ initialApplications, companies, source }: BoardProps) {
  const [applications, setApplications] = useState<Application[]>(
    () => sortApplications(initialApplications),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const companyNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies) {
      map.set(c.id, c.name);
    }
    return map;
  }, [companies]);

  const getCompanyName = useCallback(
    (companyId: string) => companyNameById.get(companyId) ?? "Unknown",
    [companyNameById],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Small activation distance so a click doesn't grab; only a drag does.
      activationConstraint: { distance: 4 },
    }),
  );

  // Group applications by stage for column rendering. Memoized to keep the
  // SortableContext item lists referentially stable across renders that
  // don't actually change the data.
  const byStage = useMemo(() => bucketByStage(applications), [applications]);

  const activeApp = activeId
    ? applications.find((a) => a.id === activeId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (activeIdStr === overIdStr) return;

    // Snapshot pre-move state so we can revert if the server rejects.
    const previousApplications = applications;

    let movedSummary: {
      id: string;
      from: ApplicationStage;
      to: ApplicationStage;
      positionInStage: number;
    } | null = null;

    setApplications((current) => {
      const dragged = current.find((a) => a.id === activeIdStr);
      if (!dragged) return current;

      const overData = over.data.current as DragData | undefined;
      const targetStage: ApplicationStage | null = overData?.stage ?? null;
      if (!targetStage) return current;

      const buckets = bucketByStage(current);
      const sourceStage = dragged.stage;

      // Remove from source.
      const sourceBucket = buckets[sourceStage];
      const sourceIndex = sourceBucket.findIndex((a) => a.id === activeIdStr);
      if (sourceIndex < 0) return current;
      sourceBucket.splice(sourceIndex, 1);

      // Compute insertion index inside the destination bucket (which may be
      // the same bucket if the move is intra-column).
      const destBucket = buckets[targetStage];
      const destIndex = computeInsertIndex(destBucket, overIdStr, overData);

      // Insert (with potentially-new stage) at destination.
      destBucket.splice(destIndex, 0, { ...dragged, stage: targetStage });

      // Flatten back to a single array with refreshed positionInStage.
      const now = new Date();
      const next: Application[] = [];
      for (const stage of ORDERED_STAGES) {
        buckets[stage].forEach((app, idx) => {
          const stageChanged = app.stage !== stage;
          const positionChanged = app.positionInStage !== idx;
          if (!stageChanged && !positionChanged) {
            next.push(app);
            return;
          }
          next.push({
            ...app,
            stage,
            positionInStage: idx,
            // Only the dragged card gets a fresh updatedAt; re-indexing
            // siblings shouldn't bump their timestamps.
            updatedAt: app.id === activeIdStr ? now : app.updatedAt,
          });
        });
      }

      const moved = next.find((a) => a.id === activeIdStr);
      if (moved) {
        movedSummary = {
          id: moved.id,
          from: sourceStage,
          to: moved.stage,
          positionInStage: moved.positionInStage,
        };
        console.log("[kanban] move", movedSummary);
      }

      return next;
    });

    // Persist after the optimistic state has been applied. We capture the
    // pre-move snapshot above so a failed server response can revert without
    // re-deriving state from the (already-mutated) current array.
    if (!movedSummary) return;
    const summary = movedSummary as {
      id: string;
      from: ApplicationStage;
      to: ApplicationStage;
      positionInStage: number;
    };

    if (source === "mock") {
      // No DB to write to — local optimistic update stands alone.
      return;
    }

    const numericId = Number(summary.id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      // Can't persist non-numeric ids (would only happen if a mock card
      // somehow slipped into a db-mode board). Revert and warn so we notice.
      console.warn(
        "[kanban] move: non-numeric id in db mode, reverting",
        summary.id,
      );
      setApplications(previousApplications);
      return;
    }

    startTransition(async () => {
      const result = await moveApplication({
        id: numericId,
        toStage: summary.to,
        toPositionInStage: summary.positionInStage,
      });
      if (!result.ok) {
        console.warn("[kanban] move: server rejected, reverting", result.error);
        setApplications(previousApplications);
      }
    });
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="kanban-scroll flex h-full gap-4 overflow-x-auto px-6 pb-6 pt-2">
        {ORDERED_STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            applications={byStage[stage]}
            getCompanyName={getCompanyName}
          />
        ))}
      </div>

      <DragOverlay>
        {activeApp ? (
          <div className="w-72 rotate-1">
            <Card
              application={activeApp}
              companyName={getCompanyName(activeApp.companyId)}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function bucketByStage(
  apps: Application[],
): Record<ApplicationStage, Application[]> {
  const buckets: Record<ApplicationStage, Application[]> = {
    lead: [],
    applied: [],
    screen: [],
    interview: [],
    offer: [],
    closed_won: [],
    closed_lost: [],
  };
  for (const app of apps) {
    buckets[app.stage].push(app);
  }
  for (const stage of ORDERED_STAGES) {
    buckets[stage].sort((a, b) => a.positionInStage - b.positionInStage);
  }
  return buckets;
}

/**
 * Compute the insertion index inside the destination bucket.
 * - Dropped on another card → insert at that card's index.
 * - Dropped on an empty column drop zone → append to the end.
 */
function computeInsertIndex(
  destBucket: Application[],
  overIdStr: string,
  overData: DragData | undefined,
): number {
  if (overData?.type === "column") return destBucket.length;
  const overIndex = destBucket.findIndex((a) => a.id === overIdStr);
  return overIndex >= 0 ? overIndex : destBucket.length;
}

function sortApplications(apps: Application[]): Application[] {
  return [...apps].sort((a, b) => {
    if (a.stage !== b.stage) {
      return ORDERED_STAGES.indexOf(a.stage) - ORDERED_STAGES.indexOf(b.stage);
    }
    return a.positionInStage - b.positionInStage;
  });
}
