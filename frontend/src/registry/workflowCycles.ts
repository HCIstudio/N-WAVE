// Loops in a workflow: a node whose output comes back to its own input,
// directly or through others (Merge → Map → Merge). Nextflow channels flow
// one way, so a loop can't be generated; the canvas refuses the connection
// that would close one, and the check flags workflows saved with one.

import type { Connection, Edge, Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";

type Link = Pick<Edge, "source" | "target">;

const nextOf = (edges: Link[]): Map<string, string[]> => {
  const next = new Map<string, string[]>();
  for (const edge of edges) next.set(edge.source, [...(next.get(edge.source) ?? []), edge.target]);
  return next;
};

/** The nodes on a path from `from` to `to`, both included, or null. */
const pathBetween = (from: string, to: string, next: Map<string, string[]>): string[] | null => {
  const seen = new Set<string>();
  const walk = (id: string): string[] | null => {
    if (id === to) return [id];
    if (seen.has(id)) return null;
    seen.add(id);
    for (const target of next.get(id) ?? []) {
      const rest = walk(target);
      if (rest) return [id, ...rest];
    }
    return null;
  };
  return walk(from);
};

/** A loop in the workflow, as node ids from a node back to it, or null. */
export const findCycle = (edges: Link[]): string[] | null => {
  const next = nextOf(edges);
  for (const edge of edges) {
    const back = pathBetween(edge.target, edge.source, next);
    if (back) return [edge.source, ...back];
  }
  return null;
};

/** The loop a new connection would close (from its target round to it), or null. */
export const cycleThroughConnection = (connection: Connection, edges: Link[]): string[] | null => {
  if (!connection.source || !connection.target) return null;
  const back = pathBetween(connection.target, connection.source, nextOf(edges));
  return back ? [...back, connection.target] : null;
};

/** "Merge → Map → Merge", with the nodes' names. */
export const describeCycle = (cycle: string[], nodes: Pick<Node<NodeData>, "id" | "data">[]): string =>
  cycle
    .map((id) => {
      const node = nodes.find((candidate) => candidate.id === id);
      return `“${String(node?.data.label || id)}”`;
    })
    .join(" → ");
