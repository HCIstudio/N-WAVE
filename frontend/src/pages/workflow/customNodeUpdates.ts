// Keeping placed custom nodes in step with their definition.

import type { Edge, Node } from "reactflow";
import type { NodeData } from "../../components/nodes/BaseNode";
import type { CustomNodeInput, StoredCustomNode } from "../../registry/customNodes";

/**
 * Nodes and edges after a custom node's definition changed: its placed
 * nodes get the new label, ports and value settings (keeping set values),
 * and connections to ports that no longer exist are dropped. Null when the
 * workflow doesn't use the custom node.
 */
export const applyCustomNodeDefinition = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  customNode: StoredCustomNode,
): { nodes: Node<NodeData>[]; edges: Edge[] } | null => {
  const affected = new Set(
    nodes
      .filter((node) => node.data.customNodeId === customNode.id)
      .map((node) => node.id),
  );
  if (affected.size === 0) return null;

  const valueInputs = customNode.inputs.filter((input) => input.kind === "val");
  const inputs = customNode.inputs
    .filter((input) => input.kind === "path")
    .map((input) => ({
      name: input.name,
      label: input.label,
      fileType: input.fileType,
      filePattern: input.filePattern,
      isConnectable: true,
    }));
  const outputs = customNode.outputs.map((output) => ({
    name: output.name,
    label: output.label,
    fileType: output.fileType,
    filePattern: output.filePattern,
    isConnectable: true,
  }));
  const inputNames = new Set(inputs.map((input) => input.name));
  const outputNames = new Set(outputs.map((output) => output.name));

  return {
    nodes: nodes.map((node) => {
      if (!affected.has(node.id)) return node;
      const previous = node.data.customNodeValues ?? {};
      return {
        ...node,
        data: {
          ...node.data,
          label: customNode.label,
          subtitle: "Custom node",
          icon: customNode.icon,
          processType: customNode.processType,
          customNodeDefinition: customNode,
          customNodeValueInputs: valueInputs,
          customNodeValues: Object.fromEntries(
            valueInputs.map((input: CustomNodeInput) => [
              input.name,
              previous[input.name] ?? input.defaultValue ?? "",
            ]),
          ),
          inputs,
          outputs,
        },
      };
    }),
    edges: edges.filter((edge) => {
      if (affected.has(edge.source)) {
        return !edge.sourceHandle || outputNames.has(edge.sourceHandle);
      }
      if (affected.has(edge.target)) {
        return !edge.targetHandle || inputNames.has(edge.targetHandle);
      }
      return true;
    }),
  };
};

/** Nodes and edges without a custom node's placed nodes, or null if none. */
export const removeCustomNode = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  customNodeId: string,
): { nodes: Node<NodeData>[]; edges: Edge[] } | null => {
  const removed = new Set(
    nodes
      .filter((node) => node.data.customNodeId === customNodeId)
      .map((node) => node.id),
  );
  if (removed.size === 0) return null;
  return {
    nodes: nodes.filter((node) => !removed.has(node.id)),
    edges: edges.filter(
      (edge) => !removed.has(edge.source) && !removed.has(edge.target),
    ),
  };
};
