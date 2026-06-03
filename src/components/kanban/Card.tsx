"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Application } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CardProps {
  application: Application;
  companyName: string;
}

/**
 * Sortable kanban card. Wraps useSortable from @dnd-kit/sortable, which
 * supplies the transform + listener handlers for drag interactions.
 */
export function Card({ application, companyName }: CardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: application.id,
    data: { type: "application", stage: application.stage },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group cursor-grab rounded-lg border border-border bg-surface-elevated p-3 text-sm shadow-sm transition-shadow",
        "hover:border-border-strong active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
        {companyName}
      </div>
      <div className="mt-1 text-sm font-medium leading-snug text-foreground">
        {application.title}
      </div>
      {application.notes ? (
        <div className="mt-2 line-clamp-2 text-xs text-foreground-muted">
          {application.notes}
        </div>
      ) : null}
      {application.appliedAt ? (
        <div className="mt-3 text-[11px] text-foreground-subtle">
          Applied {application.appliedAt.toLocaleDateString()}
        </div>
      ) : null}
    </div>
  );
}
