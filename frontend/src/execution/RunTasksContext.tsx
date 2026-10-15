import { createContext, useContext } from "react";
import type { NodeRunSummary } from "./nodeRuns";

/** The last run of the open workflow, as seen by each node. */
export interface RunTasksState {
  runId: string | null;
  nodeRuns: Record<string, NodeRunSummary>;
}

export const RunTasksContext = createContext<RunTasksState>({
  runId: null,
  nodeRuns: {},
});

/** What the last run did for this node, if anything. */
export const useNodeRun = (
  nodeId: string,
): { runId: string | null; summary: NodeRunSummary | undefined } => {
  const { runId, nodeRuns } = useContext(RunTasksContext);
  return { runId, summary: nodeRuns[nodeId] };
};
