// Branches (if / else if / else): a Branch node holds the conditions of its
// arms, on the workflow's parameters (`params.aligner == 'star'`, then
// `params.aligner == 'hisat2'`, …), tested in order; the first that holds
// chooses its arm, and when none does, the else arm runs (which may have no
// steps). Steps, channel code and other branches say which branch and arm
// they are in (`data.branch`); a branch in an arm nests.
//
// Data leaving an arm: the step after the branch reads whichever arm ran (a
// connection from each arm into the same input). A channel from outside that
// an arm passes on is a connection that holds only in that arm
// (`edge.data.when`).

import type { Edge, Node } from "@xyflow/react";

/** An arm: "if", "else-if-1", "else-if-2", …, "else". */
export type BranchArm = string;

export interface BranchMembership {
  /** The Branch node's id. */
  id: string;
  arm: BranchArm;
}

type AnyNode = Pick<Node, "id" | "type"> & { data: Record<string, unknown> };

export const BRANCH_TYPE = "branch";

export const isBranchNode = (node: Pick<Node, "type">): boolean => node.type === BRANCH_TYPE;

/** The arm of condition `index` (0: "if"). */
export const armOf = (index: number): BranchArm => (index === 0 ? "if" : `else-if-${index}`);

/** The conditions of a Branch node's arms, in order (Groovy, as in the code). */
export const branchConditions = (node: { data: Record<string, unknown> }): string[] => {
  const list = node.data.conditions;
  if (Array.isArray(list)) return list.map((entry) => String(entry ?? "").trim());
  const single = String(node.data.condition ?? "").trim();
  return single ? [single] : [];
};

/** A Branch node's arms: one per condition, then else. */
export const branchArms = (node: { data: Record<string, unknown> }): BranchArm[] => [
  ...branchConditions(node).map((_, index) => armOf(index)),
  "else",
];

/** An arm's label, as the code writes it: `if`, `else if`, `else`. */
export const armLabel = (arm: BranchArm): string => (arm === "if" ? "if" : arm === "else" ? "else" : "else if");

/** The condition under which an arm runs: its own, and none of the arms before it. */
export const armCondition = (conditions: string[], arm: BranchArm): string => {
  const index = arm === "if" ? 0 : arm === "else" ? conditions.length : Number(arm.slice("else-if-".length));
  const parts = [
    ...conditions.slice(0, index).map((condition) => `!(${condition})`),
    ...(arm === "else" ? [] : [conditions[index] ?? "true"]),
  ];
  return parts.length === 0 ? "true" : parts.join(" && ");
};

/** The branch and arm a node is in, if its Branch node is on the canvas (and has that arm). */
export const branchOf = (node: AnyNode, nodes: AnyNode[]): BranchMembership | null => {
  const membership = node.data.branch as Partial<BranchMembership> | undefined;
  if (!membership || typeof membership.id !== "string" || typeof membership.arm !== "string") return null;
  const branch = nodes.find((candidate) => candidate.id === membership.id && isBranchNode(candidate));
  if (!branch || branch.id === node.id || !branchArms(branch).includes(membership.arm)) return null;
  return { id: membership.id, arm: membership.arm };
};

/** The arm a connection holds in only (a channel from outside an arm passes on), if any. */
export const edgeWhen = (edge: Pick<Edge, "data">, nodes: AnyNode[]): BranchMembership | null => {
  const when = (edge.data as { when?: Partial<BranchMembership> } | undefined)?.when;
  if (!when || typeof when.id !== "string" || typeof when.arm !== "string") return null;
  const branch = nodes.find((candidate) => candidate.id === when.id && isBranchNode(candidate));
  return branch && branchArms(branch).includes(when.arm) ? { id: when.id, arm: when.arm } : null;
};

/** The branches a node is in, innermost first (a branch in an arm of another nests). */
export const branchChain = (node: AnyNode, nodes: AnyNode[]): BranchMembership[] => {
  const chain: BranchMembership[] = [];
  const seen = new Set<string>();
  let current: AnyNode | undefined = node;
  while (current) {
    const membership = branchOf(current, nodes);
    if (!membership || seen.has(membership.id)) break;
    seen.add(membership.id);
    chain.push(membership);
    current = nodes.find((candidate) => candidate.id === membership.id);
  }
  return chain;
};

export interface Branch<T extends AnyNode = AnyNode> {
  node: T;
  conditions: string[];
  arms: BranchArm[];
  /** Each arm's own nodes (a nested branch's are in its arms). */
  members: Map<BranchArm, T[]>;
}

/** Each Branch node with the nodes of its arms (in the canvas's order). */
export const branchesOf = <T extends AnyNode>(nodes: T[]): Map<string, Branch<T>> => {
  const branches = new Map<string, Branch<T>>();
  for (const node of nodes) {
    if (!isBranchNode(node)) continue;
    const arms = branchArms(node);
    branches.set(node.id, {
      node,
      conditions: branchConditions(node),
      arms,
      members: new Map(arms.map((arm) => [arm, [] as T[]])),
    });
  }
  for (const node of nodes) {
    const membership = branchOf(node, nodes);
    if (membership) branches.get(membership.id)?.members.get(membership.arm)?.push(node);
  }
  return branches;
};

/** Every node inside a branch, its nested branches' included. */
export const branchContents = <T extends AnyNode>(id: string, nodes: T[]): T[] =>
  nodes.filter((node) => branchChain(node, nodes).some((membership) => membership.id === id));

/**
 * Each node in an arm, with the conditions it runs under (all its branches',
 * outermost first), for the preview of when steps run.
 */
export const branchConditionsByNode = (nodes: AnyNode[]): Map<string, string[]> => {
  const byNode = new Map<string, string[]>();
  for (const node of nodes) {
    const chain = branchChain(node, nodes);
    if (chain.length === 0) continue;
    const conditions = chain
      .slice()
      .reverse()
      .map(({ id, arm }) => {
        const branch = nodes.find((candidate) => candidate.id === id);
        return branch ? armCondition(branchConditions(branch), arm) : "true";
      });
    byNode.set(node.id, conditions);
  }
  return byNode;
};

/** Whether two arms exclude each other: different arms of one branch (at any depth). */
export const exclusiveArms = (left: BranchMembership[], right: BranchMembership[]): boolean =>
  left.some((outer) => right.some((inner) => inner.id === outer.id && inner.arm !== outer.arm));

/** The params a condition reads (`params.aligner` → aligner). */
export const paramsRead = (condition: string): string[] => [
  ...new Set([...condition.matchAll(/(?<![.\w])params\.([A-Za-z_]\w*)/g)].map((match) => match[1])),
];

/** Node types that can be in an arm: steps, operators, channel code, outputs, pipelines and branches. */
const ARM_TYPES = new Set(["process", "operator", "filter", "channelOperator", "outputDisplay", "pipeline", "branch"]);

export const canJoinArm = (node: AnyNode): boolean =>
  ARM_TYPES.has(String(node.type)) && !(node.type === "channelOperator" && typeof node.data.placement === "string");

/**
 * Why `target` can't go into an arm of `branchId`, or null when it can: it
 * must be a step (or the like), not the branch itself or a branch it is in.
 */
export const armProblem = (branchId: string, target: AnyNode, nodes: AnyNode[]): string | null => {
  const label = String(target.data.label || target.type);
  if (!canJoinArm(target)) return `“${label}” can't be in a branch's arm: inputs, notes and code placed outside the workflow stay outside branches.`;
  if (target.id === branchId) return "A branch can't be in its own arm.";
  const branch = nodes.find((node) => node.id === branchId);
  if (branch && branchChain(branch, nodes).some((link) => link.id === target.id)) {
    return `“${label}” holds this branch in one of its arms, so it can't be in one of this branch's.`;
  }
  if (typeof target.data.group === "string" && target.data.group) return `“${label}” is in a group: a branch's steps can't be grouped.`;
  return null;
};
