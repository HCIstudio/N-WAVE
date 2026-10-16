// Turning a stored workflow into canvas state and back.

import type { Edge, Node } from "reactflow";
import { isDemoMode } from "../../api";
import type { FileObject, NodeData } from "../../components/nodes/BaseNode";
import { getApiErrorMessage, getResponseStatus } from "../../utils/errors";

/**
 * Edges as the canvas uses them, upgrading the handles of older workflows
 * (File Input's "out", Merge's numbered "inN" inputs).
 */
export const hydrateEdges = (
  edges: Edge[],
  nodes: Node<NodeData>[],
  onDelete: (edgeId: string) => void,
): Edge[] =>
  edges.map((edge) => {
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);
    const legacyMergeInputMatch = String(edge.targetHandle ?? "").match(
      /^in(\d+)$/,
    );

    return {
      ...edge,
      sourceHandle:
        sourceNode?.type === "fileInput" && edge.sourceHandle === "out"
          ? "ch_files_out"
          : edge.sourceHandle,
      targetHandle:
        targetNode?.data?.operatorType === "merge" && legacyMergeInputMatch
          ? "in"
          : edge.targetHandle,
      type: "default",
      data: {
        ...edge.data,
        order:
          typeof edge.data?.order === "number"
            ? edge.data.order
            : legacyMergeInputMatch?.[1]
              ? Number(legacyMergeInputMatch[1]) - 1
              : undefined,
        onDelete,
      },
    };
  });

const withoutContent = (file: FileObject): FileObject => ({
  name: file.name,
  size: file.size,
  fileType: file.fileType,
  content: "",
});

/**
 * Nodes as they are saved: file contents are dropped (they stay in the
 * browser and are re-uploaded after a reload; empty content marks that),
 * so saves stay small.
 */
export const sanitizeNodesForSave = (
  nodes: Node<NodeData>[],
): Node<NodeData>[] =>
  nodes.map((node) => {
    const data = { ...node.data };
    if (data.files) data.files = data.files.map(withoutContent);
    data.fileContent = undefined;
    data.processedContent = undefined;
    // Keep which files a filter selected, not their content.
    if (data.selectedFilterFiles) {
      data.selectedFilterFiles = data.selectedFilterFiles.map(withoutContent);
    }
    return { ...node, data };
  });

export interface LoadError {
  title: string;
  detail: string;
}

/** What to show when a workflow can't be loaded. */
export const loadErrorFor = (error: unknown): LoadError => {
  const status = getResponseStatus(error);
  if (status === 404 || status === 400) {
    return {
      title: "Workflow not found",
      detail:
        "This workflow doesn't exist or was deleted. Pick another one from the library.",
    };
  }
  return {
    title: "Couldn't load this workflow",
    detail: `${
      isDemoMode
        ? "The demo's browser storage could not be read."
        : "The N-WAVE backend did not respond. Make sure it is running and try again."
    } (${getApiErrorMessage(error, "Unknown error")})`,
  };
};
