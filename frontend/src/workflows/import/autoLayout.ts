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
  const taken = new Set(nodes.filter((node) => placed.has(node.id)).map((node) => `${node.position.x},${node.position.y}`));
  let notes = 0;
  for (const node of nodes) {
    if (placed.has(node.id)) continue;
    if (node.type === "note") {
      node.position = { x: notes * COLUMN, y: -ROW * 1.5 };
      notes += 1;
      continue;
    }
    const x = depth(node.id, new Set());
    // The next free row in its column: not on a node that has its place.
    let y = rows.get(x) ?? 0;
    while (taken.has(`${x * COLUMN},${y * ROW}`)) y += 1;
    rows.set(x, y + 1);
    node.position = { x: x * COLUMN, y: y * ROW };
  }
};

/**
 * The layout, with each branch (if / else) in a column of its own between
 * what its arms read and its arms, and room between its arms for their lanes.
 */
export const autoLayoutBranches = (nodes: Node[], edges: Edge[], placed: Set<string> = new Set()): void => {
  // A branch stands between what its arms read and its arms: its own column.
  const branchOf = (id: string) => (nodes.find((node) => node.id === id)?.data.branch as { id?: string } | undefined)?.id;
  const through = edges.flatMap((edge) => {
    const branch = branchOf(edge.target);
    if (!branch || branchOf(edge.source) === branch) return [];
    return [
      { ...edge, id: `${edge.id}:branch`, target: branch },
      { ...edge, id: `${edge.id}:arm`, source: branch },
    ];
  });
  const arms = nodes.flatMap((node) => {
    const branch = branchOf(node.id);
    return branch ? [{ id: `${branch}:${node.id}`, source: branch, target: node.id }] : [];
  });
  autoLayout(nodes, [...edges, ...through, ...arms], placed);
  // Room between a branch's arms in one column, for their lanes: each next arm (and what's below it) moves down.
  for (const branch of nodes.filter((node) => node.type === "branch" && !placed.has(node.id))) {
    const armIndex = (node: Node) => {
      const membership = node.data.branch as { id?: string; arm?: string } | undefined;
      if (membership?.id !== branch.id) return -1;
      return membership.arm === "if" ? 0 : membership.arm === "else" ? Number.MAX_SAFE_INTEGER : Number(String(membership.arm).slice("else-if-".length));
    };
    const columns = new Set(nodes.filter((node) => armIndex(node) >= 0).map((node) => node.position.x));
    for (const x of columns) {
      const members = nodes.filter((node) => armIndex(node) >= 0 && node.position.x === x).sort((left, right) => left.position.y - right.position.y);
      for (let index = 1; index < members.length; index += 1) {
        if (armIndex(members[index]) === armIndex(members[index - 1])) continue;
        const from = members[index].position.y;
        for (const node of nodes) {
          if (!placed.has(node.id) && node.position.x === x && node.position.y >= from) node.position = { ...node.position, y: node.position.y + 50 };
        }
      }
    }
  }
};
