// Branches (if/else): a Branch node holds a condition on the workflow's
// parameters (`params.aligner == 'star'`); the steps of each arm say which
// branch and arm they belong to (`data.branch`). The code runs one arm's
// steps: those of "if" when the condition holds, else those of "else".
//
// Where the arms meet again, the steps after the branch read one channel
// that either arm sets (`ch_aligned`): on the canvas, a connection from a
// step of each arm into the same input.

import type { Node } from "@xyflow/react";

export type BranchArm = "if" | "else";

export interface BranchMembership {
  /** The Branch node's id. */
  id: string;
  arm: BranchArm;
}

type AnyNode = Pick<Node, "id" | "type"> & { data: Record<string, unknown> };

export const BRANCH_TYPE = "branch";

export const isBranchNode = (node: Pick<Node, "type">): boolean => node.type === BRANCH_TYPE;

/** The condition a Branch node tests (Groovy, as in the code). */
export const branchCondition = (node: { data: Record<string, unknown> }): string =>
  String(node.data.condition ?? "").trim();

/** The branch and arm a step is in, if its Branch node is on the canvas. */
export const branchOf = (node: AnyNode, nodes: AnyNode[]): BranchMembership | null => {
  const membership = node.data.branch as Partial<BranchMembership> | undefined;
  if (!membership || typeof membership.id !== "string") return null;
  if (membership.arm !== "if" && membership.arm !== "else") return null;
  if (!nodes.some((candidate) => candidate.id === membership.id && isBranchNode(candidate))) return null;
  return { id: membership.id, arm: membership.arm };
};

export interface Branch<T extends AnyNode = AnyNode> {
  node: T;
  condition: string;
  if: T[];
  else: T[];
}

/** Each Branch node with the steps of its arms (in the canvas's order). */
export const branchesOf = <T extends AnyNode>(nodes: T[]): Map<string, Branch<T>> => {
  const branches = new Map<string, Branch<T>>();
  for (const node of nodes) {
    if (isBranchNode(node)) branches.set(node.id, { node, condition: branchCondition(node), if: [], else: [] });
  }
  for (const node of nodes) {
    const membership = branchOf(node, nodes);
    if (membership) branches.get(membership.id)?.[membership.arm].push(node);
  }
  return branches;
};

/** The condition a step of an arm runs under: the branch's, or its negation for "else". */
export const armCondition = (condition: string, arm: BranchArm): string =>
  arm === "if" ? condition : `!(${condition})`;

/** Each step in an arm, with the condition it runs under (for the preview of when steps run). */
export const branchConditions = (nodes: AnyNode[]): Map<string, string[]> => {
  const conditions = new Map<string, string[]>();
  for (const branch of branchesOf(nodes).values()) {
    if (!branch.condition) continue;
    for (const arm of ["if", "else"] as const) {
      for (const member of branch[arm]) conditions.set(member.id, [armCondition(branch.condition, arm)]);
    }
  }
  return conditions;
};

/** The params a condition reads (`params.aligner` → aligner). */
export const paramsRead = (condition: string): string[] => [
  ...new Set([...condition.matchAll(/(?<![.\w])params\.([A-Za-z_]\w*)/g)].map((match) => match[1])),
];
