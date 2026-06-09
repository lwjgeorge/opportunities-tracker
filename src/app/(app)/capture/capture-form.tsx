"use client";

import { useState, useTransition } from "react";

import type { EmailExtraction } from "@/lib/llm/types";
import { cn } from "@/lib/utils";

import {
  extractCapture,
  persistCapture,
  type ExistingFlags,
  type PersistCounts,
} from "./actions";

type Phase =
  | { kind: "input" }
  | {
      kind: "review";
      text: string;
      extraction: EmailExtraction;
      existing: ExistingFlags;
    }
  | { kind: "done"; counts: PersistCounts };

function Badge({ isNew }: { isNew: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        isNew
          ? "bg-emerald-400/15 text-emerald-300"
          : "bg-surface-elevated text-foreground-muted",
      )}
    >
      {isNew ? "new" : "existing"}
    </span>
  );
}

function contactBadgeKey(p: { name: string; email?: string }): string {
  if (p.email && p.email.trim().length > 0) {
    return `email:${p.email.trim().toLowerCase()}`;
  }
  return `name:${p.name.trim().replace(/\s+/g, " ").toLowerCase()}`;
}

function companyBadgeKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function CaptureForm() {
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submitExtract = () => {
    setError(null);
    startTransition(async () => {
      const result = await extractCapture(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPhase({
        kind: "review",
        text,
        extraction: result.extraction,
        existing: result.existing,
      });
    });
  };

  const confirm = () => {
    if (phase.kind !== "review") return;
    setError(null);
    startTransition(async () => {
      const result = await persistCapture(phase.extraction);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPhase({ kind: "done", counts: result.counts });
      setText("");
    });
  };

  const reset = () => {
    setPhase({ kind: "input" });
    setError(null);
  };

  if (phase.kind === "done") {
    const c = phase.counts;
    return (
      <div className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 p-4 text-xs text-emerald-200">
        <p className="font-semibold">Captured.</p>
        <p className="mt-1">
          {c.companiesCreated} new {c.companiesCreated === 1 ? "company" : "companies"},{" "}
          {c.contactsCreated} new {c.contactsCreated === 1 ? "contact" : "contacts"},{" "}
          {c.relationshipsCreated} new{" "}
          {c.relationshipsCreated === 1 ? "relationship" : "relationships"}.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-3 rounded border border-emerald-400/40 px-3 py-1 text-xs font-medium hover:bg-emerald-400/20"
        >
          Capture another
        </button>
      </div>
    );
  }

  if (phase.kind === "review") {
    const e = phase.extraction;
    return (
      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Original note
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-xs text-foreground-muted">
            {phase.text}
          </p>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Summary
          </h2>
          <p className="mt-2 text-xs text-foreground">{e.summary}</p>
        </section>

        {e.companies.length > 0 ? (
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Companies ({e.companies.length})
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {e.companies.map((c, i) => {
                const isNew = !phase.existing.companies[companyBadgeKey(c.name)];
                return (
                  <li
                    key={`${c.name}-${i}`}
                    className="flex items-center gap-2 text-xs"
                  >
                    <Badge isNew={isNew} />
                    <span className="font-medium text-foreground">{c.name}</span>
                    {c.domain ? (
                      <span className="font-mono text-foreground-subtle">
                        {c.domain}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {e.people.length > 0 ? (
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              People ({e.people.length})
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {e.people.map((p, i) => {
                const isNew = !phase.existing.contacts[contactBadgeKey(p)];
                return (
                  <li
                    key={`${p.name}-${i}`}
                    className="flex flex-wrap items-center gap-2 text-xs"
                  >
                    <Badge isNew={isNew} />
                    <span className="font-medium text-foreground">{p.name}</span>
                    {p.email ? (
                      <span className="font-mono text-foreground-subtle">
                        {"<"}
                        {p.email}
                        {">"}
                      </span>
                    ) : null}
                    {p.role ? (
                      <span className="text-foreground-muted">{p.role}</span>
                    ) : null}
                    {p.company ? (
                      <span className="text-foreground-subtle">@ {p.company}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {e.relationships.length > 0 ? (
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Relationships ({e.relationships.length})
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {e.relationships.map((r, i) => (
                <li key={`${r.contact.name}-${i}`} className="text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      {r.contact.name}
                    </span>
                    <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground-muted">
                      {r.relation.replace("_", " ")}
                    </span>
                    {r.company ? (
                      <span className="text-foreground-muted">
                        {r.company.name}
                      </span>
                    ) : null}
                    {r.role ? (
                      <span className="text-foreground-subtle">- {r.role}</span>
                    ) : null}
                  </div>
                  <blockquote className="mt-1 border-l-2 border-border pl-3 italic text-foreground-muted">
                    {r.sourceQuote}
                  </blockquote>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {error ? (
          <p className="text-[11px] text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="rounded border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-400/20 disabled:opacity-50"
          >
            {pending ? "Saving..." : "Confirm and save"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="rounded border border-border px-3 py-1.5 text-xs text-foreground-muted hover:border-border-strong hover:text-foreground disabled:opacity-50"
          >
            Discard
          </button>
        </div>
      </div>
    );
  }

  // Input phase
  return (
    <div className="space-y-3">
      <label htmlFor="capture-text" className="sr-only">
        Note
      </label>
      <textarea
        id="capture-text"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Met Aisha at the Postgres meetup. She's a staff engineer at Stripe and offered an intro to her hiring manager Marcus..."
        className="block h-60 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none"
        disabled={pending}
      />
      {error ? (
        <p className="text-[11px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submitExtract}
          disabled={pending || text.trim().length === 0}
          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {pending ? "Extracting..." : "Extract"}
        </button>
        <span className="text-[11px] text-foreground-subtle">
          {text.trim().length === 0
            ? "Type something to extract."
            : `${text.length} chars`}
        </span>
      </div>
    </div>
  );
}
