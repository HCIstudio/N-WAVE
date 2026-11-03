// Positions for nodes a script doesn't place: columns by how many steps come
// before (left to right), rows in the order the code has them. Nodes that
// already have a place keep it; notes go above.

import type { Edge, Node } from "@xyflow/react";

const COLUMN = 280;
const ROW = 150;

export const autoLayout = (nodes: Node[], edges: Edge[], placed: Set<string> = new Set()): void => {
  const column = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  for (const edge of edges) incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  const depth = (id: string, seen: Set<string>): number => {
    if (column.has(id)) return column.get(id) as number;
    if (seen.has(id)) return 0;
    seen.add(id);
    const before = (incoming.get(id) ?? []).map((source) => depth(source, seen) + 1);
    const value = before.length ? Math.max(...before) : 0;
    column.set(id, value);
    return value;
  };
  const rows = new Map<number, number>();
  let notes = 0;
  for (const node of nodes) {
    if (placed.has(node.id)) continue;
    if (node.type === "note") {
      node.position = { x: notes * COLUMN, y: -ROW * 1.5 };
      notes += 1;
      continue;
    }
    const x = depth(node.id, new Set());
    const y = rows.get(x) ?? 0;
    rows.set(x, y + 1);
    node.position = { x: x * COLUMN, y: y * ROW };
  }
};
