// Groups the analysis suggests (#221): BioFlow-Insight's abstractions of
// the workflow (#19), as the canvas nodes of their steps.

import type { Node } from "@xyflow/react";
import { type BioflowResult, nodesOfSteps } from "../analysis/bioflow";
import { groupOf, isGroupable } from "./groups";

export type SuggestionKind = "condition" | "dominator" | "parallel";

export interface GroupSuggestion {
  kind: SuggestionKind;
  /** The canvas nodes of its steps, in the workflow's order. */
  ids: string[];
}

/** Why these steps belong together, in a few words. */
export const SUGGESTION_REASONS: Record<SuggestionKind, string> = {
  condition: "Run under the same condition",
  dominator: "A step and the steps only it leads to",
  parallel: "Parallel branches",
};

/**
 * Each suggested group with two steps or more on the canvas, unless they are
 * one group already, or every step of the workflow (nothing to group then).
 * `names` is each node's name in the analysed script.
 */
export const groupSuggestions = (
  result: BioflowResult,
  names: Map<string, string>,
  nodes: Node[],
): GroupSuggestion[] => {
  const byName = new Map<string, string>();
  for (const [nodeId, name] of names) if (!byName.has(name)) byName.set(name, nodeId);
  const nodeOfStep = nodesOfSteps(result, byName);
  const groupable = new Map(nodes.filter(isGroupable).map((node) => [node.id, node]));
  const order = nodes.map((node) => node.id);

  const nodeOf = (stepId: string) => nodeOfStep.get(stepId);

  const seen = new Set<string>();
  const suggestions: GroupSuggestion[] = [];
  for (const kind of ["condition", "dominator", "parallel"] as const) {
    for (const group of result.groups[kind] ?? []) {
      const ids = [...new Set(group.steps.map(nodeOf).filter((id): id is string => Boolean(id && groupable.has(id))))].sort(
        (left, right) => order.indexOf(left) - order.indexOf(right),
      );
      if (ids.length < 2 || ids.length === groupable.size) continue;
      const first = groupOf(groupable.get(ids[0]) as Node);
      if (first && ids.every((id) => groupOf(groupable.get(id) as Node) === first)) continue;
      const key = ids.join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({ kind, ids });
    }
  }
  return suggestions;
};
