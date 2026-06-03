"use client";

import { useState } from "react";

import {
  approveCandidate,
  editAndApproveCandidate,
  rejectCandidate,
} from "./actions";
import { RELATION_VALUES, type RelationValue } from "@/lib/llm/types";
import { cn } from "@/lib/utils";

export type CandidateRowProps = {
  id: number;
  relation: RelationValue;
  contactName: string;
  contactEmail: string | null;
  companyName: string | null;
  role: string | null;
  confidence: number;
  sourceQuote: string;
};

function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  // Three tiers, mirroring the prompt's calibration guidance.
  const tone =
    value >= 0.85
      ? "bg-emerald-400/15 text-emerald-300"
      : value >= 0.6
        ? "bg-amber-400/15 text-amber-300"
        : "bg-rose-400/15 text-rose-300";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
        tone,
      )}
      title={`Model confidence: ${value.toFixed(2)}`}
    >
      <span className="h-1 w-6 overflow-hidden rounded-sm bg-white/10">
        <span
          className="block h-full bg-current"
          style={{ width: `${pct}%` }}
        />
      </span>
      {pct}%
    </span>
  );
}

function RelationLabel({ relation }: { relation: RelationValue }) {
  const labels: Record<RelationValue, string> = {
    works_at: "works at",
    recruited_for: "recruited for",
    introduced_by: "introduced by",
    colleague_of: "colleague of",
  };
  return (
    <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
      {labels[relation]}
    </span>
  );
}

export function CandidateRow(props: CandidateRowProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="rounded-lg border border-border bg-surface p-4">
        <form
          action={editAndApproveCandidate}
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          <input type="hidden" name="id" value={props.id} />
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-foreground-muted">Contact name</span>
            <input
              required
              name="contactName"
              defaultValue={props.contactName}
              className="rounded border border-border bg-surface-elevated px-2 py-1 text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-foreground-muted">Contact email</span>
            <input
              name="contactEmail"
              defaultValue={props.contactEmail ?? ""}
              className="rounded border border-border bg-surface-elevated px-2 py-1 text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-foreground-muted">Company</span>
            <input
              name="companyName"
              defaultValue={props.companyName ?? ""}
              className="rounded border border-border bg-surface-elevated px-2 py-1 text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-foreground-muted">Role</span>
            <input
              name="role"
              defaultValue={props.role ?? ""}
              className="rounded border border-border bg-surface-elevated px-2 py-1 text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs md:col-span-2">
            <span className="text-foreground-muted">Relation</span>
            <select
              name="relation"
              defaultValue={props.relation}
              className="rounded border border-border bg-surface-elevated px-2 py-1 text-foreground"
            >
              {RELATION_VALUES.map((r) => (
                <option key={r} value={r}>
                  {r.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 md:col-span-2">
            <button
              type="submit"
              className="rounded border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-400/20"
            >
              Save and approve
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded border border-border px-3 py-1 text-xs text-foreground-muted hover:border-border-strong hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-foreground">{props.contactName}</span>
        {props.contactEmail ? (
          <span className="font-mono text-foreground-subtle">
            {"<"}
            {props.contactEmail}
            {">"}
          </span>
        ) : null}
        <RelationLabel relation={props.relation} />
        {props.companyName ? (
          <span className="text-foreground-muted">{props.companyName}</span>
        ) : null}
        {props.role ? (
          <span className="text-foreground-subtle">- {props.role}</span>
        ) : null}
        <span className="ml-auto">
          <ConfidencePill value={props.confidence} />
        </span>
      </div>
      <blockquote className="mt-2 border-l-2 border-border pl-3 text-xs italic text-foreground-muted">
        {props.sourceQuote}
      </blockquote>
      <div className="mt-3 flex gap-2">
        <form action={approveCandidate}>
          <input type="hidden" name="id" value={props.id} />
          <button
            type="submit"
            className="rounded border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-400/20"
          >
            Approve
          </button>
        </form>
        <form action={rejectCandidate}>
          <input type="hidden" name="id" value={props.id} />
          <button
            type="submit"
            className="rounded border border-rose-400/40 bg-rose-400/10 px-3 py-1 text-xs font-medium text-rose-300 hover:bg-rose-400/20"
          >
            Reject
          </button>
        </form>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded border border-border px-3 py-1 text-xs text-foreground-muted hover:border-border-strong hover:text-foreground"
        >
          Edit
        </button>
      </div>
    </li>
  );
}
