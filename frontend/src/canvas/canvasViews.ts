// How the canvas can be shown, computed by N-WAVE itself (no server):
//   - "connections made in code": code in a node (channel operator code, an
//     imported block, a custom workflow) that calls a step or reads a
//     node's channel the canvas doesn't connect to it;
//   - "Steps only": channel operator nodes hidden, steps connected straight
//     through them.

import type { Edge, Node } from "@xyflow/react";
import type { LineOwners } from "../analysis/scriptLines";
import { maskSource, topLevelItems } from "../workflows/import/nextflowSource";

export type CanvasView = "all" | "steps";

export interface CodeConnection {
  /** Where data comes from, and the node it reaches through code. */
  from: string;
  to: string;
  /** The node whose code makes the connection. */
  in: string;
  /** How: the node's code calls the step, or reads its output or channel. */
  kind: "calls" | "reads";
}

/** Nodes that aren't steps of their own: their names in code are no connection. */
const NOT_CONNECTED_BY_NAME = new Set(["parameters", "note"]);

/**
 * The connections the generated code makes that the canvas doesn't show.
 * `names` is each node's name in the script, `owners` which node wrote
 * each line (src/analysis/scriptLines.ts).
 */
export const codeConnections = (
  nodes: Node[],
  edges: Edge[],
  script: string,
  names: Map<string, string>,
  owners: LineOwners,
): CodeConnection[] => {
  const types = new Map(nodes.map((node) => [node.id, String(node.type)]));
  const byName = new Map<string, string>();
  for (const [nodeId, name] of names) {
    if (
      !NOT_CONNECTED_BY_NAME.has(types.get(nodeId) ?? "") &&
      !byName.has(name)
    )
      byName.set(name, nodeId);
  }
  const connected = new Set(
    edges.flatMap((edge) => [
      `${edge.source}|${edge.target}`,
      `${edge.target}|${edge.source}`,
    ]),
  );
  const found = new Map<string, CodeConnection>();
  // Masked (no strings or comments), with the script's own line breaks:
  // masking blanks those inside multi-line strings.
  const masked = maskSource(script);
  const lines = Array.from(masked, (char, index) =>
    script[index] === "\n" ? "\n" : char,
  )
    .join("")
    .split("\n");
  // A process's own code (its inputs, its script) names nothing of the canvas.
  const inProcess = new Set<number>();
  for (const item of topLevelItems(script)) {
    if (item.kind !== "process") continue;
    const first = script.slice(0, item.start).split("\n").length;
    const last = script.slice(0, item.end).split("\n").length;
    for (let line = first; line <= last; line += 1) inProcess.add(line);
  }
  for (const [line, owner] of owners) {
    if (inProcess.has(line)) continue;
    const text = lines[line - 1] ?? "";
    for (const match of text.matchAll(/(?<![.\w$])([A-Za-z_]\w*)(\s*\()?/g)) {
      const other = byName.get(match[1]);
      if (!other || other === owner || connected.has(`${owner}|${other}`))
        continue;
      // `B(…)` in A's code: A's code feeds B. `B.out`, B's channel: B feeds A.
      const calls = Boolean(match[2]);
      const connection: CodeConnection = calls
        ? { from: owner, to: other, in: owner, kind: "calls" }
        : { from: other, to: owner, in: owner, kind: "reads" };
      const key = `${connection.from}|${connection.to}`;
      if (!found.has(key)) found.set(key, connection);
    }
  }
  return [...found.values()];
};

/** The edge a code connection is drawn as: dashed, not editable. */
export const codeConnectionEdge = (connection: CodeConnection): Edge => ({
  id: `code:${connection.from}->${connection.to}`,
  source: connection.from,
  target: connection.to,
  type: "derived",
  deletable: false,
  selectable: false,
  focusable: false,
  data: { kind: "code", label: "Connected in code" },
});

const isHiddenInSteps = (node: Node): boolean =>
  node.type === "channelOperator";

/**
 * The "Steps only" view: channel operator nodes hidden, and each step
 * connected straight to the steps its data reaches through them (and
 * through code connections).
 */
export const stepsOnlyView = (
  nodes: Node[],
  edges: Edge[],
  connections: CodeConnection[] = [],
): { nodes: Node[]; edges: Edge[] } => {
  const hidden = new Set(nodes.filter(isHiddenInSteps).map((node) => node.id));
  type Link = {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    kind: "edge" | CodeConnection["kind"];
  };
  const links: Link[] = [
    ...edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      kind: "edge" as const,
    })),
    ...connections.map((connection) => ({
      source: connection.from,
      target: connection.to,
      kind: connection.kind,
    })),
  ];
  const next = new Map<string, Link[]>();
  for (const link of links)
    next.set(link.source, [...(next.get(link.source) ?? []), link]);
  // Through code, data goes from what it reads to its outputs, and from its
  // inputs to the steps it calls; that it reads one step and calls another
  // doesn't say the first one's data reaches the second.
  const passes = (entered: Link["kind"], leaving: Link["kind"]) =>
    !(entered === "reads" && leaving === "calls");

  const derived = new Map<string, Edge>();
  for (const start of nodes) {
    if (hidden.has(start.id)) continue;
    for (const first of next.get(start.id) ?? []) {
      if (!hidden.has(first.target)) continue;
      // Through hidden nodes only, to the first visible ones.
      const seen = new Set<string>();
      const queue: Array<{ id: string; entered: Link["kind"] }> = [
        { id: first.target, entered: first.kind },
      ];
      while (queue.length > 0) {
        const { id: current, entered } = queue.shift() as {
          id: string;
          entered: Link["kind"];
        };
        if (seen.has(`${current}|${entered}`)) continue;
        seen.add(`${current}|${entered}`);
        for (const link of next.get(current) ?? []) {
          if (!passes(entered, link.kind)) continue;
          if (hidden.has(link.target))
            queue.push({ id: link.target, entered: link.kind });
          else if (link.target !== start.id) {
            const id = `steps:${start.id}->${link.target}`;
            if (!derived.has(id)) {
              derived.set(id, {
                id,
                source: start.id,
                target: link.target,
                sourceHandle: first.sourceHandle ?? null,
                targetHandle: link.targetHandle ?? null,
                type: "derived",
                deletable: false,
                selectable: false,
                focusable: false,
                data: { kind: "through", label: "Through channel code" },
              });
            }
          }
        }
      }
    }
  }
  return {
    nodes: nodes.map((node) =>
      hidden.has(node.id) ? { ...node, hidden: true } : node,
    ),
    edges: [
      ...edges.filter(
        (edge) => !hidden.has(edge.source) && !hidden.has(edge.target),
      ),
      ...connections
        .filter(
          (connection) =>
            !hidden.has(connection.from) && !hidden.has(connection.to),
        )
        .map(codeConnectionEdge),
      ...derived.values(),
    ],
  };
};
