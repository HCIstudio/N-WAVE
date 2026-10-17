// Turning a stored workflow into canvas state and back.

import type { Edge, Node } from "@xyflow/react";
import { isDemoMode } from "../../api";
import type { FileObject, NodeData } from "../../components/nodes/BaseNode";
import { getApiErrorMessage, getResponseStatus } from "../../utils/errors";

/** The handle an edge end attaches to, given the ports on its side of the node. */
const handleFor = (
  handle: string | null | undefined,
  ports: { name: string }[] | undefined,
): string | null | undefined => {
  // React Flow 11 attached an edge to a node's only handle whatever the
  // edge named; React Flow 12 drops the edge, so name that handle.
  if (ports?.length === 1 && handle && handle !== ports[0].name) {
    return ports[0].name;
  }
  return handle;
};

/**
 * Edges as the canvas uses them, upgrading the handles of older workflows
 * (File Input's "out", Merge's numbered "inN" inputs, a handle name that
 * doesn't match a node's only port). An edge from a node to itself, which
 * older versions allowed, is dropped: it can't be run, or seen to remove.
 */
export const hydrateEdges = (
  edges: Edge[],
  nodes: Node<NodeData>[],
  onDelete: (edgeId: string) => void,
): Edge[] =>
  edges
    .filter((edge) => edge.source !== edge.target)
    .map((edge) => {
      const sourceNode = nodes.find((node) => node.id === edge.source);
      const targetNode = nodes.find((node) => node.id === edge.target);
      const legacyMergeInputMatch = String(edge.targetHandle ?? "").match(
        /^in(\d+)$/,
      );

      return {
        ...edge,
        sourceHandle: handleFor(
          sourceNode?.type === "fileInput" && edge.sourceHandle === "out"
            ? "ch_files_out"
            : edge.sourceHandle,
          sourceNode?.data?.outputs,
        ),
        targetHandle: handleFor(
          targetNode?.data?.operatorType === "merge" && legacyMergeInputMatch
            ? "in"
            : edge.targetHandle,
          targetNode?.data?.inputs,
        ),
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

/** File Input's output was once named "out"; its edges use "ch_files_out". */
const withFileInputPort = (node: Node<NodeData>): Node<NodeData> =>
  node.type === "fileInput" && node.data.outputs?.[0]?.name === "out"
    ? {
        ...node,
        data: {
          ...node.data,
          outputs: [{ ...node.data.outputs[0], name: "ch_files_out" }],
        },
      }
    : node;

/**
 * Nodes as React Flow 12 takes them. Workflows saved with React Flow 11 carry
 * its measured `width`/`height` (and `positionAbsolute`) on each node; React
 * Flow 12 would read those as fixed sizes, so they are dropped and the nodes
 * are measured again. File Input's old "out" port gets its current name.
 */
export const hydrateNodes = (nodes: Node<NodeData>[]): Node<NodeData>[] =>
  nodes.map(withFileInputPort).map((node) => {
    const legacy = node as Node<NodeData> & { positionAbsolute?: unknown };
    if (
      legacy.width === undefined &&
      legacy.height === undefined &&
      legacy.positionAbsolute === undefined
    ) {
      return node;
    }
    const {
      width: _width,
      height: _height,
      positionAbsolute: _abs,
      ...rest
    } = legacy;
    return rest;
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
