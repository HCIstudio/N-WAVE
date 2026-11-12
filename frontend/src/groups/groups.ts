// Groups of steps (#221): steps that belong together, written as one named
// Nextflow workflow (a subworkflow) that the workflow calls. Each step keeps
// its own node and settings; the group is only `data.group`, its name, on
// each of its steps.
//
// A group's steps read what comes from outside through its takes, and the
// steps outside read its outputs as `GROUP.out.<emit>`
// (generateNextflowScript.ts). Its name is the workflow's name in the code.

import { branchOf } from "../branches/branches";
import type { Edge, Node } from "@xyflow/react";
import { placementOf } from "../generators/core/placement";
import { upperSnake } from "../generators/core/naming";
import { findCycle } from "../registry/workflowCycles";

type AnyNode = Pick<Node, "id" | "type" | "data" | "position">;

const STEP_TYPES = new Set(["operator", "filter", "process", "channelOperator"]);

/** Steps that can be in a group: those the workflow calls (not inputs, outputs, notes or placed code). */
export const isGroupable = (node: AnyNode): boolean =>
  STEP_TYPES.has(String(node.type)) &&
  !(node.type === "channelOperator" && placementOf(node.data as Record<string, unknown>));

/** A node's group, if it is a step in one. */
export const groupOf = (node: AnyNode): string | null => {
  const group = (node.data as { group?: unknown }).group;
  return typeof group === "string" && group && isGroupable(node) ? group : null;
};

/** Each group's steps, by its name. */
export const groupsOf = <T extends AnyNode>(nodes: T[]): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const node of nodes) {
    const group = groupOf(node);
    if (group) groups.set(group, [...(groups.get(group) ?? []), node]);
  }
  return groups;
};

/** A group name as the code writes it: "Read QC" → "READ_QC". */
export const groupName = (text: string): string => {
  const name = upperSnake(text);
  return name ? (/^[0-9]/.test(name) ? `GROUP_${name}` : name) : "";
};

/** "READ_QC" → "Read QC": how a group reads on the canvas. */
export const groupTitle = (name: string): string =>
  name
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");

/** The edges with each group's steps as one node (`group:<name>`), its own edges dropped. */
export const contractedEdges = (nodes: AnyNode[], edges: Edge[]): Edge[] => {
  const groupById = new Map<string, string>();
  for (const node of nodes) {
    const group = groupOf(node);
    if (group) groupById.set(node.id, `group:${group}`);
  }
  const seen = new Set<string>();
  const contracted: Edge[] = [];
  for (const edge of edges) {
    const source = groupById.get(edge.source) ?? edge.source;
    const target = groupById.get(edge.target) ?? edge.target;
    if (source === target) continue;
    const key = `${source}|${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contracted.push({ ...edge, id: key, source, target });
  }
  return contracted;
};

/**
 * Why these steps can't be grouped under this name, or null when they can:
 * they must be steps, and the data mustn't leave the group and come back
 * into it (that would be a loop between the group and a step outside).
 */
export const groupProblem = (
  nodes: AnyNode[],
  edges: Edge[],
  ids: string[],
  name: string,
  taken: Set<string> = new Set(),
): string | null => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return "The name needs a letter first, then letters, digits or _.";
  if (taken.has(name)) return `“${name}” is already the name of a step or another group.`;
  const chosen = nodes.filter((node) => ids.includes(node.id));
  if (chosen.length === 0) return "Select the steps to group.";
  const other = chosen.find((node) => !isGroupable(node));
  if (other) {
    return `“${String((other.data as { label?: unknown }).label || other.type)}” is not a step: inputs, outputs, notes and code placed outside the workflow stay outside groups.`;
  }
  // A branch's steps are written in their arm (if/else), not in a group.
  const branched = chosen.find((node) => branchOf(node, nodes) !== null);
  if (branched) {
    return `“${String((branched.data as { label?: unknown }).label || branched.type)}” is in an arm of a branch (if/else): its steps stay in their arm.`;
  }
  const grouped = nodes.map((node) => (ids.includes(node.id) ? { ...node, data: { ...node.data, group: name } } : node));
  if (findCycle(contractedEdges(grouped, edges))) {
    return "Data would leave the group and come back into it through a step outside. Add that step to the group, or leave out the steps after it.";
  }
  return null;
};

/** The nodes with these steps in the group `name`. */
export const withGroup = <T extends AnyNode>(nodes: T[], ids: string[], name: string): T[] =>
  nodes.map((node) => (ids.includes(node.id) ? ({ ...node, data: { ...node.data, group: name } } as T) : node));

/** The nodes without the group `name`: its steps back on their own. */
export const withoutGroup = <T extends AnyNode>(nodes: T[], name: string): T[] =>
  nodes.map((node) => {
    if ((node.data as { group?: unknown }).group !== name) return node;
    const { group: _group, ...data } = node.data as Record<string, unknown>;
    return { ...node, data } as T;
  });

/** The nodes with the group `from` called `to`. */
export const renamedGroup = <T extends AnyNode>(nodes: T[], from: string, to: string): T[] =>
  nodes.map((node) =>
    (node.data as { group?: unknown }).group === from ? ({ ...node, data: { ...node.data, group: to } } as T) : node,
  );
