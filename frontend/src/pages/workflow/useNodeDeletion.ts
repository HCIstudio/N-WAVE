// Deleting nodes: dragging one onto the delete zone, or confirming the
// delete button of its panel.

import { type Dispatch, type SetStateAction, useState } from "react";
import { type Edge, type Node, useReactFlow } from "reactflow";
import type { NodeData } from "../../components/nodes/BaseNode";

/** Remove a node and its connections from the canvas. */
export const removeNodeWithEdges = (
  nodeId: string,
  setNodes: Dispatch<SetStateAction<Node[]>>,
  setEdges: Dispatch<SetStateAction<Edge[]>>,
) => {
  setNodes((nodes) => nodes.filter((node) => node.id !== nodeId));
  setEdges((edges) =>
    edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
  );
};

interface Options {
  readOnly: boolean;
  duplicateReadOnlyWorkflow: () => Promise<boolean>;
  /** Whether an edit may go ahead (the run lock, read-only copies). */
  canEdit: () => boolean;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
}

export const useNodeDeletion = ({
  readOnly,
  duplicateReadOnlyWorkflow,
  canEdit,
  setNodes,
  setEdges,
}: Options) => {
  const { screenToFlowPosition } = useReactFlow();
  const [isDragging, setIsDragging] = useState(false);
  const [isHoveringDropZone, setIsHoveringDropZone] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<Node<NodeData> | null>(null);

  const onNodeDragStart = () => setIsDragging(true);

  const onNodeDrag = (_: React.MouseEvent, node: Node) => {
    if (!node.width || !node.height || !node.positionAbsolute) return;
    const dropZone = document.getElementById("delete-drop-zone");
    if (!dropZone) return;
    const rect = dropZone.getBoundingClientRect();
    const topLeft = screenToFlowPosition({ x: rect.left, y: rect.top });
    const bottomRight = screenToFlowPosition({ x: rect.right, y: rect.bottom });
    setIsHoveringDropZone(
      node.positionAbsolute.x < bottomRight.x &&
        node.positionAbsolute.x + node.width > topLeft.x &&
        node.positionAbsolute.y < bottomRight.y &&
        node.positionAbsolute.y + node.height > topLeft.y,
    );
  };

  const onNodeDragStop = (_: React.MouseEvent, node: Node) => {
    setIsDragging(false);
    if (isHoveringDropZone) {
      if (readOnly) void duplicateReadOnlyWorkflow();
      else removeNodeWithEdges(node.id, setNodes, setEdges);
    }
    setIsHoveringDropZone(false);
  };

  /** Ask before deleting the node. */
  const requestDelete = (node: Node<NodeData> | null) => {
    if (canEdit() && node) setNodeToDelete(node);
  };

  const confirmDelete = () => {
    if (!nodeToDelete) return;
    if (readOnly) void duplicateReadOnlyWorkflow();
    else removeNodeWithEdges(nodeToDelete.id, setNodes, setEdges);
    setNodeToDelete(null);
  };

  return {
    isDragging,
    isHoveringDropZone,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    nodeToDelete,
    requestDelete,
    confirmDelete,
    cancelDelete: () => setNodeToDelete(null),
  };
};
