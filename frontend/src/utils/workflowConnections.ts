import type { Edge, Node } from "reactflow";
import type { FileObject, NodeData } from "../components/nodes/BaseNode";

const getEdgeOrder = (edge: Edge, fallbackIndex: number): number => {
  const explicitOrder = edge.data?.order;
  if (typeof explicitOrder === "number" && Number.isFinite(explicitOrder)) {
    return explicitOrder;
  }

  const targetHandleOrder = String(edge.targetHandle ?? "").match(/^in(\d+)$/);
  if (targetHandleOrder?.[1]) {
    return Number(targetHandleOrder[1]) - 1;
  }

  return fallbackIndex;
};

export const sortIncomingEdges = (edges: Edge[]): Edge[] =>
  edges
    .map((edge, index) => ({ edge, index }))
    .sort(
      (a, b) =>
        getEdgeOrder(a.edge, a.index) - getEdgeOrder(b.edge, b.index) ||
        a.index - b.index
    )
    .map(({ edge }) => edge);

export const getIncomingFiles = (
  nodeId: string,
  edges: Edge[],
  nodes: Node<NodeData>[]
): FileObject[] => {
  const filesByKey = new Map<string, FileObject>();

  sortIncomingEdges(edges.filter((edge) => edge.target === nodeId))
    .forEach((edge, edgeIndex) => {
      const sourceNode = nodes.find((node) => node.id === edge.source);
      const files = sourceNode?.data.files ?? [];

      files.forEach((file, fileIndex) => {
        const key = file._id || `${file.name}:${file.size}:${file.content}`;
        if (!filesByKey.has(key)) {
          filesByKey.set(key, {
            ...file,
            order: file.order ?? edgeIndex * 1000 + fileIndex,
          });
        }
      });
    });

  return Array.from(filesByKey.values()).sort(
    (a, b) =>
      (a.order ?? Number.MAX_SAFE_INTEGER) -
        (b.order ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name)
  );
};
