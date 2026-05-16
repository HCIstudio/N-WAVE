import { useMemo, useCallback } from "react";
import { useEdges, useNodes, type Node } from "reactflow";
import type { NodeData } from "../../components/nodes/BaseNode";
import { getIncomingFiles } from "../../utils/workflowConnections";

export const useOperatorPanel = (
  node: Node<NodeData>,
  onSave: (nodeId: string, data: Partial<NodeData>) => void
) => {
  const edges = useEdges();
  const nodes = useNodes<NodeData>();

  const incomingFiles = useMemo(() => {
    return getIncomingFiles(node.id, edges, nodes);
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
