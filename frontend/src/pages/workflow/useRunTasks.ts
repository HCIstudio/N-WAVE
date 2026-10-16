// What each node did in the last run, from Nextflow's log, polled while the
// run goes. Kept outside node data so it is never saved.

import { useEffect, useMemo, useState } from "react";
import type { Node } from "reactflow";
import type { NodeData } from "../../components/nodes/BaseNode";
import { listRunTasks, type RunTask } from "../../api/runs";
import { summarizeNodeRuns } from "../../execution/nodeRuns";

/** How often tasks are fetched while a run goes. */
export const RUN_TASKS_POLL_MS = 2000;

export const useRunTasks = (
  runId: string | null,
  isRunning: boolean,
  nodes: Node<NodeData>[],
) => {
  const [tasks, setTasks] = useState<RunTask[]>([]);

  // A new run starts without the previous run's tasks.
  useEffect(() => {
    if (!runId) setTasks([]);
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const load = () =>
      listRunTasks(runId).then(
        (next) => !cancelled && setTasks(next),
        () => undefined,
      );
    void load();
    // Once more when the run ends (isRunning flips), regularly while it goes.
    const timer = isRunning
      ? window.setInterval(load, RUN_TASKS_POLL_MS)
      : undefined;
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [runId, isRunning]);

  // A Pipeline node runs the whole pipeline: all tasks are its own.
  const pipelineNodeId = useMemo(
    () => nodes.find((node) => node.type === "pipeline")?.id ?? null,
    [nodes],
  );
  return useMemo(
    () => ({
      runId,
      nodeRuns: summarizeNodeRuns(runId ? tasks : [], nodes, pipelineNodeId),
    }),
    [runId, tasks, nodes, pipelineNodeId],
  );
};
