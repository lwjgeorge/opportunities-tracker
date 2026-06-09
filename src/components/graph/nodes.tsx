"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

/**
 * Shape of `data` attached to each node we emit. Keep this minimal — react-
 * flow re-renders nodes on selection changes, and a fat `data` object blows
 * out memo equality.
 */
export type CompanyNodeData = {
  label: string;
  website: string | null;
};

export type ContactNodeData = {
  label: string;
  email: string | null;
  isRecruiter: boolean;
};

function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Company pill — the larger of the two node shapes, bold name, muted host.
 * `selected` styling comes via the react-flow wrapper that adds
 * `.react-flow__node.selected`; we layer the ring on top in CSS via the
 * data-selected attribute.
 */
export function CompanyNode({ data, selected }: NodeProps) {
  const d = data as unknown as CompanyNodeData;
  const host = hostFromUrl(d.website);
  return (
    <div
      className={`min-w-[180px] rounded-lg border bg-surface px-3 py-2 shadow-sm transition-colors ${
        selected
          ? "border-accent ring-2 ring-accent/40"
          : "border-accent/60 hover:border-accent"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-accent" />
      <div className="text-[11px] font-semibold text-foreground">{d.label}</div>
      {host ? (
        <div className="mt-0.5 font-mono text-[10px] text-foreground-subtle">
          {host}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-accent"
      />
    </div>
  );
}

/**
 * Contact pill — smaller, name + email muted. Recruiter variant adds an
 * inline badge so it's distinguishable at a glance without changing graph
 * topology.
 */
export function ContactNode({ data, selected }: NodeProps) {
  const d = data as unknown as ContactNodeData;
  return (
    <div
      className={`min-w-[160px] rounded-md border bg-surface px-2.5 py-1.5 shadow-sm transition-colors ${
        selected
          ? "border-emerald-400 ring-2 ring-emerald-400/30"
          : "border-border hover:border-border-strong"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-foreground-subtle" />
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-foreground">
          {d.label}
        </span>
        {d.isRecruiter ? (
          <span className="rounded bg-amber-400/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-300">
            recruiter
          </span>
        ) : null}
      </div>
      {d.email ? (
        <div className="mt-0.5 font-mono text-[10px] text-foreground-subtle">
          {d.email}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-foreground-subtle"
      />
    </div>
  );
}

// Map for ReactFlow's `nodeTypes` prop. Keep the keys stable — they're the
// `type` field on every node we emit.
export const NODE_TYPES = {
  company: CompanyNode,
  contact: ContactNode,
} as const;
