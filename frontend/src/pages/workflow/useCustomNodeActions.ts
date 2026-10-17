// Custom nodes from the canvas: applying an edited definition to placed
// nodes, deleting a custom node, converting a node into one, and opening
// one in the editor.

import { type Dispatch, type SetStateAction, useCallback, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import {
  deleteCustomNode,
  persistCustomNode,
  refreshCustomNodes,
} from "../../api/customNodes";
import type { ToastType } from "../../components/common";
import type { NodeData } from "../../components/nodes/BaseNode";
import {
  buildConvertedNode,
  buildCustomNodeFromNode,
  remapEdges,
} from "../../registry/convertToCustomNode";
import type { StoredCustomNode } from "../../registry/customNodes";
import { getNodeCode } from "../../registry/nodeCode";
import { getApiErrorMessage } from "../../utils/errors";
import { applyCustomNodeDefinition, removeCustomNode } from "./customNodeUpdates";

interface Options {
  nodes: Node<NodeData>[];
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setIsDirty: (dirty: boolean) => void;
  ensureEditable: () => Promise<boolean>;
  showToast: (message: string, type: ToastType) => void;
  showError: (message: string) => void;
}

export const useCustomNodeActions = ({
  nodes,
  edges,
  setNodes,
  setEdges,
  setIsDirty,
  ensureEditable,
  showToast,
  showError,
}: Options) => {
  const [deleteCandidate, setDeleteCandidate] =
    useState<StoredCustomNode | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StoredCustomNode | null>(null);

  const applyDefinition = useCallback(
    (customNode: StoredCustomNode, markDirty = true) => {
      const next = applyCustomNodeDefinition(nodes, edges, customNode);
      if (!next) return;
      setNodes(next.nodes);
      setEdges(next.edges);
      if (markDirty) setIsDirty(true);
    },
    [nodes, edges, setNodes, setEdges, setIsDirty],
  );

  const requestDelete = useCallback((customNode: StoredCustomNode) => {
    setDeleteError(null);
    setDeleteCandidate(customNode);
  }, []);

  const cancelDelete = useCallback(() => {
    setDeleteCandidate(null);
    setDeleteError(null);
  }, []);

  /** Delete the custom node everywhere, including its nodes on this canvas. */
  const confirmDelete = useCallback(async () => {
    if (!deleteCandidate) return;
    try {
      setDeleteError(null);
      await deleteCustomNode(deleteCandidate.id);
      const next = removeCustomNode(nodes, edges, deleteCandidate.id);
      if (next) {
        setNodes(next.nodes);
        setEdges(next.edges);
        setIsDirty(true);
      }
      await refreshCustomNodes();
      setDeleteCandidate(null);
    } catch (error: unknown) {
      setDeleteError(getApiErrorMessage(error, "Failed to delete custom node."));
    }
  }, [deleteCandidate, nodes, edges, setNodes, setEdges, setIsDirty]);

  // Replace a bundled or nf-core node with an editable custom copy, keeping
  // its id, position and the connections whose ports still exist.
  const convert = useCallback(
    async (node: Node<NodeData>, moduleSource?: string) => {
      if (!(await ensureEditable())) return;
      const code = getNodeCode(node);
      if (!code) throw new Error("This node has no process code to convert.");
      const { customNode, ports } = buildCustomNodeFromNode(
        node,
        code,
        moduleSource,
      );
      const saved = await persistCustomNode(customNode);
      const converted = buildConvertedNode(node, saved);
      const { edges: nextEdges, removed } = remapEdges(edges, node.id, ports);

      setNodes((current) =>
        current.map((candidate) => (candidate.id === node.id ? converted : candidate)),
      );
      setEdges(nextEdges);
      setIsDirty(true);
      const label = converted.data.label;
      const count = removed.length;
      showToast(
        count > 0
          ? `Converted "${label}" to a custom node. ${count} connection${count === 1 ? " had" : "s had"} no matching port and ${count === 1 ? "was" : "were"} removed.`
          : `Converted "${label}" to a custom node.`,
        count > 0 ? "warning" : "success",
      );
    },
    [edges, ensureEditable, setNodes, setEdges, setIsDirty, showToast],
  );

  const edit = useCallback(
    async (customNodeId: string) => {
      try {
        const stored = await refreshCustomNodes();
        const customNode =
          stored.find((candidate) => candidate.id === customNodeId) ??
          (nodes.find((node) => node.data.customNodeId === customNodeId)?.data
            .customNodeDefinition as StoredCustomNode | undefined);
        if (!customNode) {
          showError("This custom node is no longer in the node library.");
          return;
        }
        setEditing(customNode);
      } catch (error: unknown) {
        showError(getApiErrorMessage(error, "Failed to load the custom node."));
      }
    },
    [nodes, showError],
  );

  return {
    applyDefinition,
    deleteCandidate,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
    convert,
    edit,
    editing,
    closeEditor: () => setEditing(null),
  };
};
