// The canvas's views, and what the editor draws besides the workflow's nodes:
//   - the Editor; the Specification graph and the Process dependency graph,
//     read-only views of the code (analysis/graphViews.ts, BioFlow-Insight);
//   - "connections made in code": code in a node (channel operator code, an
//     imported block, a custom workflow) that calls a step or reads a
//     node's channel the canvas doesn't connect to it, drawn dashed;
//   - a frame around each group of steps (#221).

import type { Edge, Node } from "@xyflow/react";
import { type BranchArm, branchesOf, paramsRead } from "../branches/branches";
import { getNodeParameters } from "../registry/params";
import type { LineOwners } from "../analysis/scriptLines";
import { groupsOf, groupTitle } from "../groups/groups";
import { maskSource, topLevelItems } from "../workflows/import/nextflowSource";

export type CanvasView = "editor" | "specification" | "dependencies";

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
  // A branch's code names its own steps (it chooses them): shown by its lines to them.
  for (const node of nodes) {
    const branch = (node.data as { branch?: { id?: unknown } } | undefined)?.branch;
    if (typeof branch?.id === "string") connected.add(`${branch.id}|${node.id}`).add(`${node.id}|${branch.id}`);
  }
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

/** What a group's frame shows. */
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

/** What a branch's lane shows: one arm of the branch, around its steps. */
export interface BranchLaneData extends Record<string, unknown> {
  arm: BranchArm;
  condition: string;
  steps: string[];
}

/**
 * A lane around each arm of each branch: "if" (the condition holds) and
 * "else", around the arm's steps. Not part of the workflow.
 */
export const branchLanes = (nodes: Node[]): Node<BranchLaneData>[] =>
  [...branchesOf(nodes as Array<Node & { data: Record<string, unknown> }>)].flatMap(([id, branch]) =>
    (["if", "else"] as const).flatMap((arm) => {
      const members = branch[arm];
      if (members.length === 0) return [];
      // Tight: two arms one row apart don't overlap.
      const side = 14;
      const header = 20;
      const below = 6;
      const left = Math.min(...members.map((member) => member.position.x)) - side;
      const top = Math.min(...members.map((member) => member.position.y)) - header;
      const right = Math.max(...members.map((member) => member.position.x + sizeOf(member).width)) + side;
      const bottom = Math.max(...members.map((member) => member.position.y + sizeOf(member).height)) + below;
      return [
        {
          id: `lane:${id}:${arm}`,
          type: "branchLane",
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
          data: { arm, condition: branch.condition, steps: stepLabels(members) },
        },
      ];
    }),
  );

/**
 * The lines a branch draws, not the user: from its arm to each step of the
 * arm, and from the Parameters node it reads to the branch. Dashed, not editable.
 */
export const branchEdges = (nodes: Node[]): Edge[] => {
  const typed = nodes as Array<Node & { data: Record<string, unknown> }>;
  const edges: Edge[] = [];
  for (const [id, branch] of branchesOf(typed)) {
    for (const arm of ["if", "else"] as const) {
      for (const member of branch[arm]) {
        edges.push({
          id: `branch:${id}:${member.id}`,
          source: id,
          sourceHandle: arm,
          target: member.id,
          targetHandle: "branch",
          type: "derived",
          deletable: false,
          selectable: false,
          focusable: false,
          data: {
            kind: "branch",
            arm,
            label: arm === "if" ? `Runs when ${branch.condition}` : `Runs when not ${branch.condition}`,
          },
        });
      }
    }
    const read = new Set(paramsRead(branch.condition));
    for (const node of typed) {
      if (node.type !== "parameters") continue;
      const names = getNodeParameters(node.data).map((parameter) => parameter.name).filter((name) => read.has(name));
      if (names.length === 0) continue;
      edges.push({
        id: `branch-params:${node.id}:${id}`,
        source: node.id,
        sourceHandle: "branch-params",
        target: id,
        targetHandle: "params",
        type: "derived",
        deletable: false,
        selectable: false,
        focusable: false,
        data: { kind: "branch-params", label: `${names.join(", ")} chooses the arm` },
      });
    }
  }
  return edges;
};
