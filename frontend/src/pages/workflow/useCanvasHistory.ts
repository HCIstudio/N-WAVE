// Undo and redo on the canvas. The history holds snapshots of nodes and edges.
// Adding or removing a node or connection is a step of its own, right away.
// Other changes become a step once the canvas has been still for a moment, so
// a drag, a run of typing in a field, or an edit together with the data nodes
// derive from it is one step. What nodes derive just after a step, a load or
// an undo is taken into that state instead of becoming a step (restoring a
// snapshot makes them write nothing new: their derived data is in it).

import type { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NodeData } from "../../components/nodes/BaseNode";

/** How long the canvas stays still before its state becomes a step. */
export const HISTORY_SETTLE_MS = 500;
/** Steps kept; older ones are dropped. */
export const HISTORY_LIMIT = 100;
/** Node and edge changes this close together are one step (a node and its edges). */
const STRUCTURE_MERGE_MS = 100;

/** Node data that records what happened, not what was edited: never undone. */
const RECORDED_DATA_KEYS = ["pipelineLastRun"] as const;

interface Snapshot {
  nodes: Node<NodeData>[];
  edges: Edge[];
  key: string;
}

/** What a step compares: no selection, sizes, drag state or callbacks. */
const snapshotKey = (nodes: Node<NodeData>[], edges: Edge[]): string =>
  JSON.stringify(
    {
      nodes: nodes.map(({ id, type, position, parentId, data }) => ({
        id,
        type,
        parentId,
        position: { x: Math.round(position.x), y: Math.round(position.y) },
        data,
      })),
      edges: edges.map(
        ({ id, source, target, sourceHandle, targetHandle, data }) => ({
          id,
          source,
          target,
          sourceHandle,
          targetHandle,
          data,
        }),
      ),
    },
    (key, value) =>
      typeof value === "function" ||
      (RECORDED_DATA_KEYS as readonly string[]).includes(key)
        ? undefined
        : value,
  );

const snapshotOf = (nodes: Node<NodeData>[], edges: Edge[]): Snapshot => ({
  nodes,
  edges,
  key: snapshotKey(nodes, edges),
});

/** `restored`'s nodes, keeping what the current nodes recorded meanwhile. */
const withRecordedData = (
  restored: Node<NodeData>[],
  current: Node<NodeData>[],
): Node<NodeData>[] =>
  restored.map((node) => {
    const now = current.find((candidate) => candidate.id === node.id);
    if (!now) return node;
    const recorded = Object.fromEntries(
      RECORDED_DATA_KEYS.filter((key) => key in now.data).map((key) => [
        key,
        now.data[key],
      ]),
    );
    return Object.keys(recorded).length > 0
      ? { ...node, data: { ...node.data, ...recorded } }
      : node;
  });

const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.closest("input, textarea, select, .cm-editor") !== null);

interface CanvasHistoryOptions {
  nodes: Node<NodeData>[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setIsDirty: (dirty: boolean) => void;
  /** False while the workflow loads, a run locks it, or it's read-only. */
  enabled: boolean;
  /** A new workflow (its id) starts a new history. */
  documentKey: string | undefined;
  /** True while the workflow loads: its first state is no step. */
  isLoading: boolean;
}

/** Where the nodes are: nodes never move themselves, so a move is an edit. */
const positionsKey = (nodes: Node<NodeData>[]): string =>
  nodes
    .map((node) => `${node.id}:${Math.round(node.position.x)},${Math.round(node.position.y)}`)
    .join(",");

/** Which nodes and connections there are, not what they hold. */
const structureKey = (nodes: Node<NodeData>[], edges: Edge[]): string =>
  [
    nodes.map((node) => node.id).join(","),
    edges
      .map((edge) => `${edge.source}.${edge.sourceHandle}>${edge.target}.${edge.targetHandle}`)
      .join(","),
  ].join("|");

export const useCanvasHistory = ({
  nodes,
  edges,
  setNodes,
  setEdges,
  setIsDirty,
  enabled,
  documentKey,
  isLoading,
}: CanvasHistoryOptions) => {
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  // The state the last step ended in.
  const baseline = useRef<Snapshot | null>(null);
  // The next settled state is taken into the baseline without a step.
  const absorbNext = useRef(false);
  const previousRender = useRef<{ nodes: Node<NodeData>[]; edges: Edge[] } | null>(null);
  const restoring = useRef(false);
  const lastStructureStep = useRef(0);
  const latest = useRef({ nodes, edges });
  latest.current = { nodes, edges };
  const [sizes, setSizes] = useState({ undo: 0, redo: 0 });
  const syncSizes = useCallback(
    () =>
      setSizes({
        undo: undoStack.current.length,
        redo: redoStack.current.length,
      }),
    [],
  );

  const pushStep = useCallback(
    (snapshot: Snapshot) => {
      undoStack.current = [...undoStack.current, snapshot].slice(-HISTORY_LIMIT);
      redoStack.current = [];
      syncSizes();
    },
    [syncSizes],
  );

  // A new or reloaded workflow starts without history.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset per document
  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    baseline.current = null;
    previousRender.current = null;
    syncSizes();
  }, [documentKey, isLoading, syncSizes]);

  /** Make the current state a step if it differs from the last one. */
  const commit = useCallback(() => {
    const { nodes: currentNodes, edges: currentEdges } = latest.current;
    const current = snapshotOf(currentNodes, currentEdges);
    const previous = baseline.current;
    baseline.current = current;
    if (!previous || previous.key === current.key) {
      absorbNext.current = false;
      return;
    }
    if (absorbNext.current) {
      absorbNext.current = false;
      // Derived data only: no step. A move meanwhile is.
      if (positionsKey(previous.nodes) === positionsKey(current.nodes)) return;
    }
    pushStep(previous);
  }, [pushStep]);

  const dragging = nodes.some((node) => node.dragging);
  useEffect(() => {
    if (isLoading) return;
    const before = previousRender.current;
    previousRender.current = { nodes, edges };
    if (!baseline.current) {
      // Where the document's history starts, once its nodes derived their data.
      baseline.current = snapshotOf(nodes, edges);
      absorbNext.current = true;
    } else if (restoring.current) {
      restoring.current = false;
    } else if (
      before &&
      structureKey(before.nodes, before.edges) !== structureKey(nodes, edges)
    ) {
      // A node or connection was added or removed: a step from the state just
      // before it (an edit still settling then is a step of its own).
      if (Date.now() - lastStructureStep.current > STRUCTURE_MERGE_MS) {
        const prior = snapshotOf(before.nodes, before.edges);
        if (!absorbNext.current && baseline.current.key !== prior.key) {
          pushStep(baseline.current);
        }
        pushStep(prior);
      }
      lastStructureStep.current = Date.now();
      baseline.current = snapshotOf(nodes, edges);
      absorbNext.current = true;
    }
    if (dragging) return;
    const timer = window.setTimeout(commit, HISTORY_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [nodes, edges, dragging, isLoading, commit, pushStep]);

  const restore = useCallback(
    (direction: "undo" | "redo") => {
      if (!enabled) return;
      // A change still settling is a step of its own.
      if (!dragging) commit();
      const [from, to] =
        direction === "undo"
          ? [undoStack.current, redoStack.current]
          : [redoStack.current, undoStack.current];
      const target = from.pop();
      if (!target || !baseline.current) return;
      to.push(baseline.current);
      baseline.current = target;
      absorbNext.current = true;
      restoring.current = true;
      setNodes((current) => withRecordedData(target.nodes, current));
      setEdges(target.edges);
      setIsDirty(true);
      syncSizes();
    },
    [enabled, dragging, commit, setNodes, setEdges, setIsDirty, syncSizes],
  );

  const undo = useCallback(() => restore("undo"), [restore]);
  const redo = useCallback(() => restore("redo"), [restore]);

  // Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl+Y redo. Text fields keep
  // their own undo.
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (isTextField(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, undo, redo]);

  return {
    canUndo: enabled && sizes.undo > 0,
    canRedo: enabled && sizes.redo > 0,
    undo,
    redo,
  };
};

export type CanvasHistory = ReturnType<typeof useCanvasHistory>;
