import type { Node } from "@xyflow/react";
import type { RunTask } from "../api/runs";
import { getProcessNameForNode } from "../generators/core/generateNextflowScript";

/** What the last run did for one node of the canvas. */
export interface NodeRunSummary {
  /** "cached": every task was reused from an earlier run (a resumed run). */
  status: "running" | "succeeded" | "failed" | "cached";
  total: number;
  done: number;
  failed: number;
  /** Tasks that failed but whose error Nextflow ignores, counted in `done`. */
  ignored: number;
  running: number;
  /** Tasks reused from the cache, counted in `done` too. */
  cached: number;
  tasks: RunTask[];
  /**
   * The node's processes, when it runs more than one (a subworkflow or a
   * whole pipeline), in the order their first task showed up.
   */
  processes?: ProcessRunSummary[];
}

/** What the last run did for one Nextflow process of a node. */
export interface ProcessRunSummary
  extends Omit<NodeRunSummary, "processes" | "tasks"> {
  /** Nextflow's full name, e.g. "NFCORE_ATACSEQ:ATACSEQ:FASTQC". */
  process: string;
  /** The process's own name, e.g. "FASTQC". */
  label: string;
}

/** Counts and the overall status of a set of tasks. */
const summarizeTasks = (tasks: RunTask[]) => {
  const failed = tasks.filter((task) => task.status === "failed").length;
  const ignored = tasks.filter((task) => task.status === "ignored").length;
  const running = tasks.filter((task) => task.status === "running").length;
  const cached = tasks.filter((task) => task.status === "cached").length;
  return {
    status: (failed > 0
      ? "failed"
      : running > 0
        ? "running"
        : cached === tasks.length
          ? "cached"
          : "succeeded") as NodeRunSummary["status"],
    total: tasks.length,
    done: tasks.length - failed - running,
    failed,
    ignored,
    running,
    cached,
  };
};

/**
 * A node's tasks by process. Processes are named by their last part;
 * where two share it (the same module in two subworkflows), by the last two.
 */
const summarizeProcesses = (tasks: RunTask[]): ProcessRunSummary[] => {
  const byProcess = new Map<string, RunTask[]>();
  for (const task of tasks) {
    byProcess.set(task.process, [...(byProcess.get(task.process) ?? []), task]);
  }
  const lastPart = (process: string, parts: number) =>
    process.split(":").slice(-parts).join(":");
  const names = [...byProcess.keys()];
  return names.map((process) => {
    const short = lastPart(process, 1);
    const shared = names.some(
      (other) => other !== process && lastPart(other, 1) === short,
    );
    return {
      process,
      label: shared ? lastPart(process, 2) : short,
      ...summarizeTasks(byProcess.get(process) ?? []),
    };
  });
};

/**
 * Process names differ only in case and separators between the generator
 * (e.g. "filter_demo_filter_barry", nf-core aliases are upper-cased) and
 * what Nextflow reports.
 */
const normalize = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The canvas node that runs a Nextflow process ("<ALIAS>:<PROCESS>" inside
 * an nf-core subworkflow node); every process of a pipeline run belongs to
 * its Pipeline node.
 */
export const nodeIdForProcess = (
  process: string,
  nodes: Node[],
  pipelineNodeId?: string | null,
): string | undefined => {
  if (pipelineNodeId) return pipelineNodeId;
  const wanted = normalize(process.split(":")[0] ?? "");
  return nodes.find((node) => normalize(getProcessNameForNode(node)) === wanted)?.id;
};

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
    const processes = summarizeProcesses(nodeTasks);
    summaries[nodeId] = {
      ...summarizeTasks(nodeTasks),
      tasks: nodeTasks,
      ...(processes.length > 1 ? { processes } : {}),
    };
  }
  return summaries;
};
