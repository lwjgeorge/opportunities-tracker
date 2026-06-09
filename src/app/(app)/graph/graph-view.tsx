"use client";

import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  type Node,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useMemo, useState } from "react";

import { NODE_TYPES } from "@/components/graph/nodes";
import { STAGE_CONFIG } from "@/lib/stages";
import type { ApplicationStage } from "@/lib/types";

import { applyDagreLayout } from "./dagre-layout";

function stageLabel(stage: ApplicationStage): string {
  return STAGE_CONFIG[stage]?.label ?? stage;
}

export type GraphData = {
  companies: {
    id: number;
    name: string;
    website: string | null;
    careersUrl: string | null;
    notes: string | null;
  }[];
  contacts: {
    id: number;
    name: string;
    email: string | null;
    linkedinUrl: string | null;
  }[];
  recruiterContactIds: number[];
  relationships: {
    id: number;
    contactId: number;
    companyId: number;
    role: string | null;
  }[];
  applications: {
    id: number;
    companyId: number;
    primaryContactId: number | null;
    title: string;
    stage: ApplicationStage;
  }[];
};

type SelectedKey =
  | { kind: "company"; id: number }
  | { kind: "contact"; id: number }
  | null;

/**
 * Build react-flow nodes + edges from the snapshot. Memoised on the data
 * reference so re-renders from selection don't relayout.
 */
function buildGraph(data: GraphData, query: string): { nodes: Node[]; edges: Edge[] } {
  const q = query.trim().toLowerCase();
  const matches = (name: string): boolean =>
    q.length === 0 || name.toLowerCase().includes(q);

  const recruiterSet = new Set(data.recruiterContactIds);

  // First pass: which contact ids are connected to a matching company (or
  // vice versa). When the filter is empty everything is "in"; when it's set
  // we keep the matched node plus its first-hop neighbours so the graph
  // doesn't dissolve into islands.
  const matchingCompanyIds = new Set<number>();
  const matchingContactIds = new Set<number>();
  if (q.length > 0) {
    for (const c of data.companies) if (matches(c.name)) matchingCompanyIds.add(c.id);
    for (const p of data.contacts) if (matches(p.name)) matchingContactIds.add(p.id);
    // Expand to first-hop neighbours.
    for (const r of data.relationships) {
      if (matchingCompanyIds.has(r.companyId)) matchingContactIds.add(r.contactId);
      if (matchingContactIds.has(r.contactId)) matchingCompanyIds.add(r.companyId);
    }
  }

  const keepCompany = (id: number) =>
    q.length === 0 ? true : matchingCompanyIds.has(id);
  const keepContact = (id: number) =>
    q.length === 0 ? true : matchingContactIds.has(id);

  const nodes: Node[] = [];

  for (const c of data.companies) {
    if (!keepCompany(c.id)) continue;
    nodes.push({
      id: `company-${c.id}`,
      type: "company",
      data: { label: c.name, website: c.website },
      // Provisional position; dagre overwrites these before render.
      position: { x: 0, y: 0 },
    });
  }
  for (const p of data.contacts) {
    if (!keepContact(p.id)) continue;
    nodes.push({
      id: `contact-${p.id}`,
      type: "contact",
      data: {
        label: p.name,
        email: p.email,
        isRecruiter: recruiterSet.has(p.id),
      },
      position: { x: 0, y: 0 },
    });
  }

  const edges: Edge[] = [];
  for (const r of data.relationships) {
    if (!keepCompany(r.companyId) || !keepContact(r.contactId)) continue;
    edges.push({
      id: `rel-${r.id}`,
      source: `contact-${r.contactId}`,
      target: `company-${r.companyId}`,
      label: r.role ?? undefined,
      // Use a markerEnd so direction (contact → company) is legible.
      markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
      style: { stroke: "#475569" },
      labelStyle: { fontSize: 10, fill: "#94a3b8" },
      labelBgStyle: { fill: "#0f172a" },
    });
  }

  const laidNodes = applyDagreLayout(nodes, edges);
  return { nodes: laidNodes, edges };
}

function CompanyPanel({
  company,
  data,
  onClose,
}: {
  company: GraphData["companies"][number];
  data: GraphData;
  onClose: () => void;
}) {
  const related = data.relationships
    .filter((r) => r.companyId === company.id)
    .map((r) => ({
      relationship: r,
      contact: data.contacts.find((c) => c.id === r.contactId),
    }))
    .filter((row) => row.contact != null);

  const apps = data.applications.filter((a) => a.companyId === company.id);

  return (
    <aside className="absolute right-0 top-0 z-10 flex h-full w-80 flex-col border-l border-border bg-surface">
      <PanelHeader title={company.name} subtitle="Company" onClose={onClose} />
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
        {company.website ? (
          <PanelField label="Website">
            <a
              href={company.website}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-foreground underline decoration-foreground-subtle hover:decoration-foreground"
            >
              {company.website}
            </a>
          </PanelField>
        ) : null}
        {company.careersUrl ? (
          <PanelField label="Careers">
            <a
              href={company.careersUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-foreground underline decoration-foreground-subtle hover:decoration-foreground"
            >
              {company.careersUrl}
            </a>
          </PanelField>
        ) : null}
        {company.notes ? (
          <PanelField label="Notes">
            <p className="whitespace-pre-wrap text-foreground-muted">
              {company.notes}
            </p>
          </PanelField>
        ) : null}
        <PanelField label={`Contacts (${related.length})`}>
          {related.length === 0 ? (
            <p className="text-foreground-subtle">No linked contacts.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {related.map(({ relationship: r, contact }) => (
                <li key={r.id}>
                  <Link
                    href={`/contacts/${contact!.id}`}
                    className="text-foreground hover:underline"
                  >
                    {contact!.name}
                  </Link>
                  {r.role ? (
                    <span className="text-foreground-subtle"> - {r.role}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </PanelField>
        <PanelField label={`Applications (${apps.length})`}>
          {apps.length === 0 ? (
            <p className="text-foreground-subtle">No applications.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {apps.map((a) => (
                <li key={a.id}>
                  <span className="text-foreground">{a.title}</span>
                  <span className="text-foreground-subtle">
                    {" "}
                    - {stageLabel(a.stage)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/applications`}
            className="mt-2 inline-block text-foreground-muted hover:underline"
          >
            All applications &rarr;
          </Link>
        </PanelField>
      </div>
    </aside>
  );
}

function ContactPanel({
  contact,
  data,
  isRecruiter,
  onClose,
}: {
  contact: GraphData["contacts"][number];
  data: GraphData;
  isRecruiter: boolean;
  onClose: () => void;
}) {
  const linked = data.relationships
    .filter((r) => r.contactId === contact.id)
    .map((r) => ({
      relationship: r,
      company: data.companies.find((c) => c.id === r.companyId),
    }))
    .filter((row) => row.company != null);

  const apps = data.applications.filter(
    (a) => a.primaryContactId === contact.id,
  );

  return (
    <aside className="absolute right-0 top-0 z-10 flex h-full w-80 flex-col border-l border-border bg-surface">
      <PanelHeader
        title={contact.name}
        subtitle={isRecruiter ? "Recruiter" : "Contact"}
        onClose={onClose}
      />
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
        {contact.email ? (
          <PanelField label="Email">
            <a
              href={`mailto:${contact.email}`}
              className="font-mono text-foreground hover:underline"
            >
              {contact.email}
            </a>
          </PanelField>
        ) : null}
        {contact.linkedinUrl ? (
          <PanelField label="LinkedIn">
            <a
              href={contact.linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-foreground underline decoration-foreground-subtle hover:decoration-foreground"
            >
              {contact.linkedinUrl}
            </a>
          </PanelField>
        ) : null}
        <PanelField label={`At companies (${linked.length})`}>
          {linked.length === 0 ? (
            <p className="text-foreground-subtle">No company links.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {linked.map(({ relationship: r, company }) => (
                <li key={r.id}>
                  <Link
                    href={`/companies/${company!.id}`}
                    className="text-foreground hover:underline"
                  >
                    {company!.name}
                  </Link>
                  {r.role ? (
                    <span className="text-foreground-subtle"> - {r.role}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </PanelField>
        <PanelField label={`Applications (${apps.length})`}>
          {apps.length === 0 ? (
            <p className="text-foreground-subtle">
              No applications linked to this contact.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {apps.map((a) => (
                <li key={a.id}>
                  <span className="text-foreground">{a.title}</span>
                  <span className="text-foreground-subtle">
                    {" "}
                    - {stageLabel(a.stage)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelField>
      </div>
    </aside>
  );
}

function PanelHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between border-b border-border px-4 py-3">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
          {subtitle}
        </p>
        <h2 className="mt-0.5 text-sm font-semibold text-foreground">
          {title}
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-1 text-foreground-muted hover:bg-surface-elevated hover:text-foreground"
        aria-label="Close panel"
      >
        ×
      </button>
    </div>
  );
}

function PanelField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1 text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
        {label}
      </h3>
      <div>{children}</div>
    </div>
  );
}

export function GraphView({ data }: { data: GraphData }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedKey>(null);

  const { nodes, edges } = useMemo(() => buildGraph(data, query), [data, query]);

  const isEmpty = data.companies.length === 0 && data.contacts.length === 0;

  if (isEmpty) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-sm text-center text-xs text-foreground-subtle">
          <p className="text-sm font-medium text-foreground-muted">
            No entities yet.
          </p>
          <p className="mt-1">
            Capture your first contact at{" "}
            <Link href="/capture" className="text-accent hover:underline">
              /capture
            </Link>{" "}
            or wire Gmail polling at{" "}
            <Link href="/settings/email" className="text-accent hover:underline">
              /settings/email
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const selectedCompany =
    selected?.kind === "company"
      ? data.companies.find((c) => c.id === selected.id)
      : undefined;
  const selectedContact =
    selected?.kind === "contact"
      ? data.contacts.find((c) => c.id === selected.id)
      : undefined;
  const recruiterSet = new Set(data.recruiterContactIds);

  return (
    <div className="relative h-full w-full">
      {/* Search toolbar */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-border bg-surface/90 px-2 py-1 shadow-sm backdrop-blur">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name..."
          className="w-48 bg-transparent text-xs text-foreground placeholder:text-foreground-subtle focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-[10px] text-foreground-subtle hover:text-foreground"
          >
            clear
          </button>
        ) : null}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (node.type === "company") {
            setSelected({
              kind: "company",
              id: Number(node.id.replace("company-", "")),
            });
          } else if (node.type === "contact") {
            setSelected({
              kind: "contact",
              id: Number(node.id.replace("contact-", "")),
            });
          }
        }}
        onPaneClick={() => setSelected(null)}
      >
        <Background gap={20} color="#1e293b" />
        <Controls showInteractive={false} />
      </ReactFlow>

      {selectedCompany ? (
        <CompanyPanel
          company={selectedCompany}
          data={data}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {selectedContact ? (
        <ContactPanel
          contact={selectedContact}
          data={data}
          isRecruiter={recruiterSet.has(selectedContact.id)}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
