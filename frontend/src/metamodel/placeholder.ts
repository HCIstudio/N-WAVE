// A step from a DAW model whose task has no implementation: a process that
// only says so (fromDawModel.ts). It stops being one when its code changes.

import type { Node } from "@xyflow/react";

/** What a placeholder's script prints; its code has it until somebody writes the step. */
export const PLACEHOLDER_MARKER = "has no implementation yet";

export const isPlaceholder = (node: Pick<Node, "data">): boolean => {
  const data = node.data as { placeholder?: unknown; customNodeDefinition?: { source?: unknown } };
  return data.placeholder === true && String(data.customNodeDefinition?.source ?? "").includes(PLACEHOLDER_MARKER);
};
