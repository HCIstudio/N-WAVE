// The preview of when each step runs: the analysis's conditions (while the
// workflow's steps are as analysed), evaluated with the Parameters node's
// current values, so it follows each change of a value.

import type { Node } from "@xyflow/react";
import { useEffect, useMemo } from "react";
import { logActivity } from "../activity/activityLog";
import type { NodeData } from "../components/nodes/BaseNode";
import { conditionsByNode, type NodeConditions, parameterValues, previewConditions } from "./conditions";
import type { WorkflowAnalysisState } from "./useWorkflowAnalysis";

const NONE: Record<string, NodeConditions> = {};

export const useStepConditions = (
  state: Pick<WorkflowAnalysisState, "analysis" | "structureCurrent">,
  nodes: Node<NodeData>[],
  enabled: boolean,
): Record<string, NodeConditions> => {
  const { analysis, structureCurrent } = state;
  const byNode = useMemo(
    () =>
      enabled && structureCurrent && analysis?.bioflow.status === "done"
        ? conditionsByNode(analysis.bioflow.result, analysis.names)
        : null,
    [enabled, structureCurrent, analysis],
  );
  const values = useMemo(() => JSON.stringify([...parameterValues(nodes)]), [nodes]);
  const preview = useMemo(
    () => (byNode && byNode.size > 0 ? previewConditions(byNode, new Map(JSON.parse(values))) : NONE),
    [byNode, values],
  );

  // Verbose mode: which steps the preview says won't run, each time that changes.
  const notRunning = Object.entries(preview)
    .filter(([, entry]) => entry.runs === false)
    .map(([nodeId]) => nodeId)
    .sort()
    .join(",");
  useEffect(() => {
    if (preview === NONE) return;
    logActivity("conditions.preview", { notRunning: notRunning ? notRunning.split(",") : [], conditional: Object.keys(preview).length });
  }, [notRunning, preview]);

  return preview;
};
