// How the canvas can be shown, computed by N-WAVE itself (no server):
//   - "connections made in code": code in a node (channel operator code, an
//     imported block, a custom workflow) that calls a step or reads a
//     node's channel the canvas doesn't connect to it;
//   - "Steps only": channel operator nodes hidden, steps connected straight
//     through them;
//   - "Grouped": each group of steps (#221) as one box, connected to the
//     rest; and in All, a frame around each group's steps.

import { type Edge, type Node, Position } from "@xyflow/react";
import type { LineOwners } from "../analysis/scriptLines";
import { groupsOf, groupTitle } from "../groups/groups";
import { maskSource, topLevelItems } from "../workflows/import/nextflowSource";

export type CanvasView = "all" | "steps" | "grouped";

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

/** What a group's box and frame show. */
export interface GroupNodeData extends Record<string, unknown> {
  group: string;
  title: string;
  steps: string[];
}

const DEFAULT_SIZE = { width: 180, height: 90 };
const sizeOf = (node: Node) => ({
  width: node.measured?.width ?? node.width ?? DEFAULT_SIZE.width,
  height: node.measured?.height ?? node.height ?? DEFAULT_SIZE.height,
});
const stepLabels = (members: Node[]) => members.map((member) => String((member.data as { label?: unknown }).label || member.type));

/** A frame behind each group's steps, with its name (All view). */
export const groupFrames = (nodes: Node[]): Node<GroupNodeData>[] =>
  [...groupsOf(nodes)].map(([group, members]) => {
    const padding = 20;
    const header = 30;
    const left = Math.min(...members.map((member) => member.position.x)) - padding;
    const top = Math.min(...members.map((member) => member.position.y)) - padding - header;
    const right = Math.max(...members.map((member) => member.position.x + sizeOf(member).width)) + padding;
    const bottom = Math.max(...members.map((member) => member.position.y + sizeOf(member).height)) + padding;
    return {
      id: `frame:${group}`,
      type: "groupFrame",
      position: { x: left, y: top },
      style: { width: right - left, height: bottom - top },
      width: right - left,
      height: bottom - top,
      zIndex: -1,
      selectable: false,
      draggable: false,
      connectable: false,
      deletable: false,
      focusable: false,
      data: { group, title: groupTitle(group), steps: stepLabels(members) },
    };
  });

export const GROUP_BOX_WIDTH = 224;
/** Its name, its steps (five at most, then "and N more") and Open. */
const groupBoxHeight = (steps: number) => 112 + 18 * Math.min(steps, 6);

/**
 * The "Grouped" view: each group's steps hidden behind one box, the
 * connections into and out of them drawn to the box.
 */
export const groupedView = (nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } => {
  const groups = groupsOf(nodes);
  const boxOf = new Map<string, string>();
  for (const [group, members] of groups) for (const member of members) boxOf.set(member.id, `group:${group}`);
  const boxes: Node<GroupNodeData>[] = [...groups].map(([group, members]) => ({
    id: `group:${group}`,
    type: "groupBox",
    position: {
      x: Math.min(...members.map((member) => member.position.x)),
      y: Math.min(...members.map((member) => member.position.y)),
    },
    // A size of its own: the canvas measures only the workflow's nodes.
    width: GROUP_BOX_WIDTH,
    height: groupBoxHeight(members.length),
    style: { width: GROUP_BOX_WIDTH, height: groupBoxHeight(members.length) },
    // Its handles, where GroupBoxNode draws them: in, left; out, right.
    handles: [
      { type: "target" as const, position: Position.Left, x: -4, y: groupBoxHeight(members.length) / 2 - 4, width: 8, height: 8 },
      { type: "source" as const, position: Position.Right, x: GROUP_BOX_WIDTH - 4, y: groupBoxHeight(members.length) / 2 - 4, width: 8, height: 8 },
    ],
    selectable: false,
    draggable: false,
    connectable: false,
    deletable: false,
    data: { group, title: groupTitle(group), steps: stepLabels(members) },
  }));
  const shown = new Map<string, Edge>();
  for (const edge of edges) {
    const source = boxOf.get(edge.source);
    const target = boxOf.get(edge.target);
    if (!source && !target) {
      shown.set(edge.id, edge);
      continue;
    }
    if (source && source === target) continue;
    const from = source ?? edge.source;
    const to = target ?? edge.target;
    const id = `grouped:${from}:${source ? "" : (edge.sourceHandle ?? "")}->${to}:${target ? "" : (edge.targetHandle ?? "")}`;
    if (shown.has(id)) continue;
    shown.set(id, {
      id,
      source: from,
      target: to,
      sourceHandle: source ? null : edge.sourceHandle,
      targetHandle: target ? null : edge.targetHandle,
      type: "derived",
      deletable: false,
      selectable: false,
      focusable: false,
      data: { kind: "through", label: "Into or out of a group" },
    });
  }
  return {
    nodes: [...nodes.map((node) => (boxOf.has(node.id) ? { ...node, hidden: true } : node)), ...boxes],
    edges: [...shown.values()],
  };
};
