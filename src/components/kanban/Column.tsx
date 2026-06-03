"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Application, ApplicationStage } from "@/lib/types";
import { STAGE_CONFIG } from "@/lib/stages";
import { Card } from "./Card";
import { cn } from "@/lib/utils";

interface ColumnProps {
  stage: ApplicationStage;
  applications: Application[];
  /**
   * Lookup for the company name displayed at the top of each card.
   * Injected by the Board so the column doesn't need to know whether the
   * data came from mock-data or the DB.
   */
  getCompanyName: (companyId: string) => string;
}

export function Column({ stage, applications, getCompanyName }: ColumnProps) {
  const config = STAGE_CONFIG[stage];

  // Droppable for empty-column case. When a column has zero cards there's no
  // SortableItem to land on; this ref gives dnd-kit a target id of the stage.
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${stage}`,
    data: { type: "column", stage },
  });

  const itemIds = applications.map((a) => a.id);

  return (
    <div className="flex h-full w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", config.accentClass)} />
          <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
            {config.label}
          </span>
          <span className="text-xs text-foreground-subtle">
            {applications.length}
          </span>
        </div>
      </div>

      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex flex-1 flex-col gap-2 rounded-lg border border-transparent p-1.5 transition-colors",
            isOver ? "border-border-strong bg-surface/40" : "bg-transparent",
          )}
        >
          {applications.map((application) => (
            <Card
              key={application.id}
              application={application}
              companyName={getCompanyName(application.companyId)}
            />
          ))}
          {applications.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-foreground-subtle">
              Drop here
            </div>
          ) : null}
        </div>
      </SortableContext>
    </div>
  );
}
