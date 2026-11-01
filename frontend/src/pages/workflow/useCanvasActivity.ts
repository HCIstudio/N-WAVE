// Verbose mode on the canvas: nodes added, removed, moved or configured, and
// connections made or removed, by comparing what the canvas shows now with
// before. It sees every way a change happens (menu, paste, delete, undo,
// templates). Moves and edits are recorded once they settle, so a drag or
// typing a name is one event, not hundreds.

import { useEffect, useRef } from "react";
import type { Edge, Node } from "@xyflow/react";
import { isRecording, logActivity, setActivityWorkflow } from "../../activity/activityLog";
import type { NodeData } from "../../components/nodes/BaseNode";
import { checkPortFit } from "../../registry/portTypes";
import { currentRecordsValues } from "../../settings/useFeatures";

/** A move or an edit is recorded after this long without another. */
export const ACTIVITY_SETTLE_MS = 800;

/** Data a node keeps about what happened, not settings anyone changed. */
const isRecordedKey = (key: string): boolean => key.startsWith("_") || key === "pipelineLastRun";

const valueKey = (value: unknown): string =>
  JSON.stringify(value, (_key, inner) => (typeof inner === "function" ? undefined : inner)) ?? "";

/** The keys of the settings that differ between two versions of a node's data. */
export const changedKeys = (before: NodeData, after: NodeData): string[] => {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter(
      (key) =>
        !isRecordedKey(key) &&
        typeof (after as Record<string, unknown>)[key] !== "function" &&
        valueKey((before as Record<string, unknown>)[key]) !==
          valueKey((after as Record<string, unknown>)[key]),
    )
    .sort();
};

const nodeFacts = (node: Node<NodeData>) => ({
  nodeId: node.id,
  nodeType: node.type,
  label: typeof node.data?.label === "string" ? node.data.label : undefined,
});

const edgeFacts = (edge: Edge) => ({
  edgeId: edge.id,
  source: edge.source,
  sourceHandle: edge.sourceHandle ?? null,
  target: edge.target,
  targetHandle: edge.targetHandle ?? null,
});

interface Options {
  workflowId: string | undefined;
  nodes: Node<NodeData>[];
  edges: Edge[];
  /** The workflow is still being read: its nodes don't count as added. */
  isLoading: boolean;
}

export const useCanvasActivity = ({ workflowId, nodes, edges, isLoading }: Options): void => {
  const previous = useRef<{ nodes: Map<string, Node<NodeData>>; edges: Map<string, Edge> } | null>(null);
  // Moves and edits waiting to settle: node id → changed keys.
  const moved = useRef(new Set<string>());
  const configured = useRef(new Map<string, { node: Node<NodeData>; keys: Set<string> }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSettled = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (moved.current.size > 0) {
      logActivity("node.moved", { nodeIds: [...moved.current].sort() });
      moved.current.clear();
    }
    for (const { node, keys } of configured.current.values()) {
      const sorted = [...keys].sort();
      logActivity("node.configured", {
        ...nodeFacts(node),
        keys: sorted,
        ...(currentRecordsValues()
          ? { values: Object.fromEntries(sorted.map((key) => [key, (node.data as Record<string, unknown>)[key]])) }
          : {}),
      });
    }
    configured.current.clear();
  };
  const flushRef = useRef(flushSettled);
  flushRef.current = flushSettled;

  // Events carry the workflow open in this tab.
  useEffect(() => {
    setActivityWorkflow(workflowId);
    previous.current = null;
    return () => {
      flushRef.current();
      setActivityWorkflow(undefined);
    };
  }, [workflowId]);

  useEffect(() => {
    if (isLoading) return;
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const edgeMap = new Map(edges.map((edge) => [edge.id, edge]));
    const before = previous.current;
    previous.current = { nodes: nodeMap, edges: edgeMap };
    if (!before) {
      logActivity("workflow.opened", { nodes: nodes.length, edges: edges.length });
      return;
    }
    if (!isRecording()) return;

    for (const [id, node] of nodeMap) {
      const old = before.nodes.get(id);
      if (!old) {
        logActivity("node.added", nodeFacts(node));
        continue;
      }
      if (
        !node.dragging &&
        (Math.round(old.position.x) !== Math.round(node.position.x) ||
          Math.round(old.position.y) !== Math.round(node.position.y))
      ) {
        moved.current.add(id);
      }
      if (old.data !== node.data) {
        const keys = changedKeys(old.data, node.data);
        if (keys.length > 0) {
          const waiting = configured.current.get(id) ?? { node, keys: new Set<string>() };
          waiting.node = node;
          for (const key of keys) waiting.keys.add(key);
          configured.current.set(id, waiting);
        }
      }
    }
    for (const [id, node] of before.nodes) {
      if (nodeMap.has(id)) continue;
      moved.current.delete(id);
      configured.current.delete(id);
      logActivity("node.removed", nodeFacts(node));
    }
    for (const [id, edge] of edgeMap) {
      if (before.edges.has(id)) continue;
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      const hint =
        source && target ? checkPortFit(source, edge.sourceHandle ?? "", target, edge.targetHandle ?? "") : null;
      logActivity("connection.made", { ...edgeFacts(edge), ...(hint ? { hint: hint.message } : {}) });
    }
    for (const [id, edge] of before.edges) {
      if (!edgeMap.has(id)) logActivity("connection.removed", edgeFacts(edge));
    }

    if (moved.current.size > 0 || configured.current.size > 0) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flushRef.current(), ACTIVITY_SETTLE_MS);
    }
  }, [nodes, edges, isLoading]);
};
