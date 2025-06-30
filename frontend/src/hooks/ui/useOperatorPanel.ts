import { useMemo, useCallback } from "react";
import { useEdges, useNodes, type Node } from "reactflow";
import type { NodeData } from "../components/nodes/BaseNode";

export const useOperatorPanel = (
  node: Node<NodeData>,
  onSave: (nodeId: string, data: Partial<NodeData>) => void
) => {
  const edges = useEdges();
  const nodes = useNodes<NodeData>();

  const incomingFiles = useMemo(() => {
    const parentEdge = edges.find((edge) => edge.target === node.id);
    if (!parentEdge) return [];
    const parentNode = nodes.find((n) => n.id === parentEdge.source);
    const files = parentNode?.data.files || [];

    return files;
  }, [edges, nodes, node.id]);

  const handleDataChange = useCallback(
    (field: keyof NodeData, value: any) => {
      onSave(node.id, { [field]: value });
    },
    [node.id, onSave]
  );

  return {
    incomingFiles,
    handleDataChange,
  };
};
