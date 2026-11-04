import type { Node } from "@xyflow/react";
import type { RunTask } from "../api/runs";
import { legacyProcessNameForNode } from "../generators/core/generateNextflowScript";
import { processNamesFor } from "../generators/core/naming";
import { groupsOf } from "../groups/groups";

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

/** Counts and the overall status of a set of tasks (also of a nested step). */
export const summarizeTasks = (tasks: RunTask[]) => {
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
/**
 * Node ids by the (normalized) process name their tasks run as: the names
 * scripts use since 1.6, and the ones earlier runs used.
 */
const processLookup = (nodes: Node[]): Map<string, string> => {
  const lookup = new Map<string, string>();
  for (const node of nodes) lookup.set(normalize(legacyProcessNameForNode(node)), node.id);
  for (const [id, name] of processNamesFor(nodes)) lookup.set(normalize(name), id);
  return lookup;
};

/** Groups (#221) are workflows of their own: `GROUP:PROC`, `GROUP:SUB:PROC` run as PROC, SUB. */
const groupNames = (nodes: Node[]): Set<string> =>
  new Set([...groupsOf(nodes).keys()].map(normalize));

/** The node a task's process belongs to: its first part, after any groups. */
const nodeOfProcess = (process: string, lookup: Map<string, string>, groups: Set<string>): string | undefined => {
  const parts = process.split(":").map(normalize);
  let index = 0;
  while (index < parts.length - 1 && groups.has(parts[index]) && !lookup.has(parts[index])) index += 1;
  return lookup.get(parts[index] ?? "");
};

export const nodeIdForProcess = (
  process: string,
  nodes: Node[],
  pipelineNodeId?: string | null,
): string | undefined => {
  if (pipelineNodeId) return pipelineNodeId;
  return nodeOfProcess(process, processLookup(nodes), groupNames(nodes));
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
  const nodeByProcess = processLookup(nodes);
  const groups = groupNames(nodes);

  const grouped = new Map<string, RunTask[]>();
  for (const task of tasks) {
    const nodeId =
      pipelineNodeId ?? nodeOfProcess(task.process, nodeByProcess, groups);
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
