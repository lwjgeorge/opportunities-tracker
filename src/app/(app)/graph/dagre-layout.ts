import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

/**
 * Run a one-shot dagre layout on the graph. We don't keep dagre around for
 * incremental relayout — for this use case the user captures a few entries,
 * the server re-renders, and we recompute. Cheap and predictable.
 *
 * Hierarchy: top-to-bottom (TB). Company nodes are wider than contact nodes
 * so we feed dagre per-node dimensions rather than a global default — it
 * tightens up the visual rhythm without overlapping pills.
 */
const COMPANY_WIDTH = 200;
const COMPANY_HEIGHT = 60;
const CONTACT_WIDTH = 180;
const CONTACT_HEIGHT = 52;

export function applyDagreLayout<N extends Node, E extends Edge>(
  nodes: N[],
  edges: E[],
): N[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 70, nodesep: 36 });

  for (const node of nodes) {
    const isCompany = node.type === "company";
    g.setNode(node.id, {
      width: isCompany ? COMPANY_WIDTH : CONTACT_WIDTH,
      height: isCompany ? COMPANY_HEIGHT : CONTACT_HEIGHT,
    });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  // dagre returns the centre of each node; react-flow wants the top-left
  // corner, so subtract half the node's dimensions.
  return nodes.map((node) => {
    const laid = g.node(node.id);
    if (!laid) return node;
    const isCompany = node.type === "company";
    const w = isCompany ? COMPANY_WIDTH : CONTACT_WIDTH;
    const h = isCompany ? COMPANY_HEIGHT : CONTACT_HEIGHT;
    return {
      ...node,
      position: { x: laid.x - w / 2, y: laid.y - h / 2 },
    };
  });
}
