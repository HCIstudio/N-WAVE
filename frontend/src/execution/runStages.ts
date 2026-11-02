// The run panel's progress by step: every step the run will go through, done,
// running or still waiting, with how many of its tasks finished. Steps are
// the canvas nodes that make Nextflow processes (connected process, filter
// and operator nodes); for a Pipeline node, the pipeline's own processes.

import type { Edge, Node } from "@xyflow/react";
import type { NodeRunSummary } from "./nodeRuns";

export type StageStatus = "waiting" | "running" | "succeeded" | "failed" | "cached";

export interface RunStage {
  id: string;
  label: string;
  status: StageStatus;
  done: number;
  total: number;
}

/** Node types the generator turns into a Nextflow process when connected. */
const PROCESS_TYPES = new Set(["process", "filter", "operator"]);

const labelOf = (node: Node | undefined, id: string): string =>
  String((node?.data as { label?: unknown } | undefined)?.label || id);

export const runStages = ({
  nodes,
  edges,
  nodeRuns,
  consoleProcesses,
}: {
  nodes: Node[];
  edges: Edge[];
  nodeRuns: Record<string, NodeRunSummary>;
  /** How many processes Nextflow's console lists (with those still waiting), if it said. */
  consoleProcesses?: number;
}): RunStage[] => {
  const pipeline = nodes.find((node) => node.type === "pipeline");
  if (pipeline) {
    const run = nodeRuns[pipeline.id];
    const processes: RunStage[] = (
      run?.processes ??
      (run ? [{ process: pipeline.id, label: labelOf(pipeline, pipeline.id), ...run }] : [])
    ).map((process) => ({
      id: process.process,
      label: process.label,
      status: process.status,
      done: process.done,
      total: process.total,
    }));
    const waiting = Math.max(0, (consoleProcesses ?? 0) - processes.length);
    return [
      ...processes,
      ...Array.from({ length: waiting }, (_, index) => ({
        id: `waiting-${index}`,
        label: "A process that hasn't started yet",
        status: "waiting" as const,
        done: 0,
        total: 0,
      })),
    ];
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const connected = new Set(edges.map((edge) => edge.target));
  const started: RunStage[] = Object.entries(nodeRuns).map(([id, run]) => ({
    id,
    label: labelOf(byId.get(id), id),
    status: run.status,
    done: run.done,
    total: run.total,
  }));
  const waiting: RunStage[] = nodes
    .filter((node) => PROCESS_TYPES.has(node.type ?? "") && connected.has(node.id) && !nodeRuns[node.id])
    .map((node) => ({ id: node.id, label: labelOf(node, node.id), status: "waiting", done: 0, total: 0 }));
  return [...started, ...waiting];
};

/** How many steps are in each state. */
export const countStages = (stages: RunStage[]): Record<StageStatus, number> => {
  const counts: Record<StageStatus, number> = { waiting: 0, running: 0, succeeded: 0, failed: 0, cached: 0 };
  for (const stage of stages) counts[stage.status] += 1;
  return counts;
};
