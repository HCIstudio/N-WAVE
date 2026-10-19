// Copy and paste of canvas nodes. Copying takes the selected nodes with their
// settings and the connections between them; pasting adds them with new IDs,
// beside the originals (or where they were, in another workflow). The
// clipboard is kept in browser storage, so it works across workflows.

import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../../components/nodes/BaseNode";

const STORAGE_KEY = "nwave.clipboard";
/** How far each paste is moved from nodes already at that spot. */
export const PASTE_OFFSET = 40;

export interface ClipboardContent {
  version: 1;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

/** What the canvas adds to nodes and edges for the moment, not for copies. */
const forClipboard = (node: Node<NodeData>): Node<NodeData> => {
  const { pipelineLastRun: _lastRun, ...data } = node.data;
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    ...(node.parentId ? { parentId: node.parentId } : {}),
    data: JSON.parse(JSON.stringify(data)) as NodeData,
  };
};

/** The selected nodes and the connections between them, or null. */
export const copySelection = (
  nodes: Node<NodeData>[],
  edges: Edge[],
): ClipboardContent | null => {
  const selected = nodes.filter((node) => node.selected);
  if (selected.length === 0) return null;
  const ids = new Set(selected.map((node) => node.id));
  return {
    version: 1,
    nodes: selected.map(forClipboard),
    edges: edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map(({ id, source, target, sourceHandle, targetHandle, type }) => ({
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
        type,
      })),
  };
};

let memoryClipboard: ClipboardContent | null = null;

/** Forget what was copied, in this tab and in browser storage. */
export const clearClipboard = (): void => {
  memoryClipboard = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable.
  }
};

/** Keep `content` for pasting, here and in other workflows of this browser. */
export const writeClipboard = (content: ClipboardContent): void => {
  memoryClipboard = content;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
  } catch {
    // Too large for browser storage (e.g. big input files): pasting still
    // works in this tab.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable.
    }
  }
};

const isClipboardContent = (value: unknown): value is ClipboardContent =>
  typeof value === "object" &&
  value !== null &&
  (value as ClipboardContent).version === 1 &&
  Array.isArray((value as ClipboardContent).nodes) &&
  Array.isArray((value as ClipboardContent).edges) &&
  (value as ClipboardContent).nodes.every(
    (node) =>
      typeof node?.id === "string" &&
      typeof node.position?.x === "number" &&
      typeof node.position?.y === "number" &&
      typeof node.data === "object" &&
      node.data !== null,
  );

/** What was copied last, in this tab or another one. */
export const readClipboard = (): ClipboardContent | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isClipboardContent(parsed)) return parsed;
    }
  } catch {
    // Unreadable: fall back to this tab's copy.
  }
  return memoryClipboard;
};

/**
 * Nodes and edges to add for `content`: new IDs, connections between the
 * copies, and moved by PASTE_OFFSET steps until no copy sits on an existing
 * node's spot. The copies come selected.
 */
export const pasteContent = (
  content: ClipboardContent,
  existing: Node<NodeData>[],
  newId: (index: number) => string,
): { nodes: Node<NodeData>[]; edges: Edge[] } => {
  const ids = new Map(content.nodes.map((node, index) => [node.id, newId(index)]));
  const taken = (x: number, y: number) =>
    existing.some(
      (node) => Math.abs(node.position.x - x) < 10 && Math.abs(node.position.y - y) < 10,
    );
  let step = 0;
  while (
    step < 50 &&
    content.nodes.some((node) =>
      taken(node.position.x + step * PASTE_OFFSET, node.position.y + step * PASTE_OFFSET),
    )
  ) {
    step++;
  }
  const shift = step * PASTE_OFFSET;
  const nodes = content.nodes.map((node) => ({
    ...node,
    id: ids.get(node.id) as string,
    position: { x: node.position.x + shift, y: node.position.y + shift },
    // A parent left behind would hide the copy: it is placed on its own.
    ...(node.parentId && ids.has(node.parentId)
      ? { parentId: ids.get(node.parentId) }
      : { parentId: undefined }),
    data: JSON.parse(JSON.stringify(node.data)) as NodeData,
    selected: true,
  }));
  const edges = content.edges.flatMap((edge) => {
    const source = ids.get(edge.source);
    const target = ids.get(edge.target);
    if (!source || !target) return [];
    return [
      {
        ...edge,
        id: ["e", source, edge.sourceHandle, target, edge.targetHandle]
          .filter(Boolean)
          .join("-"),
        source,
        target,
      },
    ];
  });
  return { nodes, edges };
};
