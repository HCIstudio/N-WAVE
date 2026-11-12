// The open workflow's view (the Editor, or a read-only graph of its code) and,
// in the editor, the connections its code makes that the canvas doesn't
// show (computed from its generated script) and a frame around each group.

import type { Edge, Node } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { logActivity } from "../activity/activityLog";
import { codeSignature } from "../analysis/analysis";
import { lineOwners } from "../analysis/scriptLines";
import type { NodeData } from "../components/nodes/BaseNode";
import { generateNextflowScriptWithNames } from "../generators/core/generateNextflowScript";
import type { WorkflowProblem } from "../pages/workflow/workflowCheck";
import {
  type CanvasView,
  type CodeConnection,
  codeConnectionEdge,
  codeConnections,
  groupFrames,
} from "./canvasViews";

const NONE: CodeConnection[] = [];

const label = (nodes: Node<NodeData>[], id: string) => {
  const node = nodes.find((entry) => entry.id === id);
  return String(node?.data.label || node?.type || id);
};

/** A connection made in code, as a warning of the workflow check. */
export const codeConnectionProblem = (
  connection: CodeConnection,
  nodes: Node<NodeData>[],
): WorkflowProblem => ({
  id: `code:${connection.from}->${connection.to}`,
  level: "warning",
  nodeId: connection.in,
  message:
    connection.kind === "calls"
      ? `The code of “${label(nodes, connection.in)}” calls “${label(nodes, connection.to)}”, which the canvas doesn't connect to it (dashed line).`
      : `The code of “${label(nodes, connection.in)}” reads “${label(nodes, connection.from)}”, which the canvas doesn't connect to it (dashed line).`,
});

export const useCanvasView = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  workflowName: string,
  { showCodeConnections = true }: { showCodeConnections?: boolean } = {},
) => {
  const [view, setViewState] = useState<CanvasView>("editor");
  const signature = useMemo(() => codeSignature(nodes, edges), [nodes, edges]);

  // From the code, so only when the code changes (not on a drag).
  const latest = useRef({ nodes, edges });
  latest.current = { nodes, edges };
  // biome-ignore lint/correctness/useExhaustiveDependencies: recomputed when the code changes, read from the latest nodes.
  const connections = useMemo(() => {
    const current = latest.current;
    try {
      const { script, names } = generateNextflowScriptWithNames(
        current.nodes,
        current.edges,
        workflowName || "workflow",
        "results",
      );
      return codeConnections(
        current.nodes,
        current.edges,
        script,
        names,
        lineOwners(script, names, current.nodes),
      );
    } catch {
      // A loop: the workflow check says so; no code to read.
      return [];
    }
  }, [signature, workflowName]);
  const shown = showCodeConnections ? connections : NONE;

  // An edit (anything that changes the code) goes back to the editor, where it can be made.
  const lastSignature = useRef(signature);
  useEffect(() => {
    if (signature !== lastSignature.current && view !== "editor")
      setViewState("editor");
    lastSignature.current = signature;
  }, [signature, view]);

  const setView = (next: CanvasView) => {
    setViewState(next);
    logActivity("canvas.viewChanged", { view: next });
  };

  // The editor's nodes and edges (the graph views draw the analysis instead).
  const display = useMemo(() => {
    const frames = groupFrames(nodes);
    return {
      nodes: frames.length > 0 ? [...frames, ...nodes] : nodes,
      edges:
        shown.length > 0 ? [...edges, ...shown.map(codeConnectionEdge)] : edges,
    };
  }, [nodes, edges, shown]);

  // The messages follow the connections (labels from the latest nodes).
  const problems = useMemo(
    () =>
      shown.map((connection) =>
        codeConnectionProblem(connection, latest.current.nodes),
      ),
    [shown],
  );

  return {
    view,
    setView,
    nodes: display.nodes,
    edges: display.edges,
    connections: shown,
    problems,
  };
};
