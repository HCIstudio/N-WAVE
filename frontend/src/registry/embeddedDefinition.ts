import type { Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";
import type { NodeDefinition } from "./nodeDefinitions";

// Definitions a node carries itself (a process imported from a script, kept
// only in its workflow). customNodes.ts sets the resolver; nodeDefinitions.ts
// asks it. A module of its own, so neither imports the other for it.

let resolver: ((node: Node<NodeData>) => NodeDefinition | undefined) | null = null;

export const setEmbeddedDefinitionResolver = (
  next: (node: Node<NodeData>) => NodeDefinition | undefined,
): void => {
  resolver = next;
};

export const embeddedDefinitionFor = (node: Node<NodeData>): NodeDefinition | undefined => resolver?.(node);
