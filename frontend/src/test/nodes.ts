import type { Node } from "reactflow";
import type { NodeData } from "../components/nodes/BaseNode";
import { nodeDefinitions } from "../registry/nodeDefinitions";

/** A canvas node created the way the "Add node" menu creates it. */
export const makeNode = (
  definitionId: string,
  extra: Partial<NodeData> = {},
): Node<NodeData> => {
  const definition = nodeDefinitions.find((entry) => entry.id === definitionId);
  if (!definition) throw new Error(`No node definition ${definitionId}`);
  return {
    id: `node-${definitionId}`,
    type: definition.type,
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      icon: definition.icon,
      ...definition.defaults,
      ...extra,
    },
  };
};
