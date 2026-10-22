// What each node did in the last run, from Nextflow's log, polled while the
// run goes. Kept outside node data so it is never saved.

import { useEffect, useMemo, useState } from "react";
import type { Node } from "@xyflow/react";
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
    let timer: number | undefined;
    // The next poll waits for the last answer, so a slow backend doesn't
    // pile up requests (or get them back out of order).
    const load = async () => {
      try {
        const next = await listRunTasks(runId);
        if (!cancelled) setTasks(next);
      } catch {
        // The next poll tries again.
      }
      // Once more when the run ends (isRunning flips), regularly while it goes.
      if (!cancelled && isRunning) {
        timer = window.setTimeout(() => void load(), RUN_TASKS_POLL_MS);
      }
    };
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
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
