import { useMemo, useCallback } from "react";
import { useEdges, useNodes, type Node } from "@xyflow/react";
import type { NodeData } from "../../components/nodes/BaseNode";
import { getIncomingFiles } from "../../utils/workflowConnections";

export const useOperatorPanel = (
  node: Node<NodeData>,
  onSave: (nodeId: string, data: Partial<NodeData>) => void
) => {
  const edges = useEdges();
  const nodes = useNodes<Node<NodeData>>();

  const incomingFiles = useMemo(() => {
    return getIncomingFiles(node.id, edges, nodes);
  }, [edges, nodes, node.id]);

  const handleDataChange = useCallback(
    <K extends keyof NodeData>(field: K, value: NodeData[K]) => {
      onSave(node.id, { [field]: value });
    },
    [node.id, onSave]
  );

  return {
    incomingFiles,
    handleDataChange,
  };
};
