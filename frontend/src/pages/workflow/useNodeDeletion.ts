// Deleting nodes: dragging one onto the delete zone, or confirming the
// delete button of its panel.

import { type Dispatch, type SetStateAction, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
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
  requestCopy: () => Promise<boolean>;
  /** Whether an edit may go ahead (the run lock, read-only copies). */
  canEdit: () => boolean;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
}

/** The mouse or touch event of a drag: where the pointer is. */
type PointerLike = {
  clientX?: number;
  clientY?: number;
  touches?: ArrayLike<{ clientX: number; clientY: number }>;
};

export const useNodeDeletion = ({
  readOnly,
  requestCopy,
  canEdit,
  setNodes,
  setEdges,
}: Options) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHoveringDropZone, setIsHoveringDropZone] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<Node<NodeData> | null>(null);

  const onNodeDragStart = () => setIsDragging(true);

  // On the bin when the pointer is: not when the node's box only touches it,
  // which deleted large nodes moved near the edge.
  const onNodeDrag = (event: PointerLike, _node: Node) => {
    const point = event.touches?.[0] ?? event;
    if (point.clientX === undefined || point.clientY === undefined) return;
    const dropZone = document.getElementById("delete-drop-zone");
    if (!dropZone) return;
    const rect = dropZone.getBoundingClientRect();
    setIsHoveringDropZone(
      point.clientX >= rect.left && point.clientX <= rect.right && point.clientY >= rect.top && point.clientY <= rect.bottom,
    );
  };

  const onNodeDragStop = (_: unknown, node: Node) => {
    setIsDragging(false);
    if (isHoveringDropZone) {
      if (readOnly) void requestCopy();
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
    if (readOnly) void requestCopy();
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
