import type { Node } from "reactflow";
import type { RunTask } from "../api/runs";
import { getProcessNameForNode } from "../generators/core/generateNextflowScript";

/** What the last run did for one node of the canvas. */
export interface NodeRunSummary {
  status: "running" | "succeeded" | "failed";
  total: number;
  done: number;
  failed: number;
  running: number;
  tasks: RunTask[];
}

/**
 * Process names differ only in case and separators between the generator
 * (e.g. "filter_demo_filter_barry", nf-core aliases are upper-cased) and
 * what Nextflow reports.
 */
const normalize = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Groups a run's tasks by the canvas node that generated them.
 *
 * A task belongs to the node whose process (or nf-core alias) it runs; for
 * an nf-core subworkflow node Nextflow names tasks "<ALIAS>:<PROCESS>".
 * When the canvas runs a whole pipeline, every task belongs to that node.
 */
export const summarizeNodeRuns = (
  tasks: RunTask[],
  nodes: Node[],
  pipelineNodeId?: string | null,
): Record<string, NodeRunSummary> => {
  const nodeByProcess = new Map<string, string>();
  for (const node of nodes) {
    nodeByProcess.set(normalize(getProcessNameForNode(node)), node.id);
  }

  const grouped = new Map<string, RunTask[]>();
  for (const task of tasks) {
    const nodeId =
      pipelineNodeId ??
      nodeByProcess.get(normalize(task.process.split(":")[0] ?? ""));
    if (!nodeId) continue;
    grouped.set(nodeId, [...(grouped.get(nodeId) ?? []), task]);
  }

  const summaries: Record<string, NodeRunSummary> = {};
  for (const [nodeId, nodeTasks] of grouped) {
    const failed = nodeTasks.filter((task) => task.status === "failed").length;
    const running = nodeTasks.filter((task) => task.status === "running").length;
    const done = nodeTasks.length - failed - running;
    summaries[nodeId] = {
      status: failed > 0 ? "failed" : running > 0 ? "running" : "succeeded",
      total: nodeTasks.length,
      done,
      failed,
      running,
      tasks: nodeTasks,
    };
  }
  return summaries;
};
