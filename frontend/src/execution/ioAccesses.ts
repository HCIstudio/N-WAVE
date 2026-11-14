// What the I/O monitor recorded in a run, by canvas node: the backend links
// each access to its task (monitor/linkAccesses.ts); a task belongs to the
// node that runs its process, as for the trace and the run's tasks.

import type { Node } from "@xyflow/react";
import type { LinkedTask, RunAccesses } from "../api/runs";
import { nodeIdForProcess } from "./nodeRuns";

export interface NodeAccesses {
  nodeId: string;
  tasks: LinkedTask[];
  /** Bytes its tasks read from and wrote to files in the run's folder. */
  bytesRead: number;
  bytesWritten: number;
  /** Distinct files (by path) its tasks touched. */
  files: number;
}

/** The linked tasks of a run, grouped by the canvas node of their process. */
export const accessesByNode = (
  accesses: RunAccesses,
  nodes: Node[],
  pipelineNodeId?: string | null,
): Record<string, NodeAccesses> => {
  if (accesses.status !== "recorded") return {};
  const byNode: Record<string, NodeAccesses> = {};
  for (const task of accesses.tasks) {
    const nodeId = nodeIdForProcess(task.process, nodes, pipelineNodeId);
    if (!nodeId) continue;
    const entry = byNode[nodeId] ?? { nodeId, tasks: [], bytesRead: 0, bytesWritten: 0, files: 0 };
    entry.tasks.push(task);
    for (const file of task.files) {
      entry.bytesRead += file.bytesRead;
      entry.bytesWritten += file.bytesWritten;
    }
    entry.files = new Set(entry.tasks.flatMap((linked) => linked.files.map((file) => file.path))).size;
    byNode[nodeId] = entry;
  }
  return byNode;
};

/** "1,964 accesses: 1,240 linked to steps; 298 by Nextflow and Docker, …" */
export const describeUnlinked = (accesses: RunAccesses): string | null => {
  if (accesses.status !== "recorded") return null;
  const { outsideTasks, unknownProcess, unknownFile, tasksWithoutStart } = accesses.unlinked;
  const unlinked = outsideTasks + unknownProcess + unknownFile;
  const parts = [
    outsideTasks ? `${outsideTasks} by processes outside the steps' containers (Nextflow, Docker)` : null,
    unknownProcess ? `${unknownProcess} by processes started before the monitor` : null,
    unknownFile ? `${unknownFile} to files whose opening the monitor didn't record` : null,
  ].filter(Boolean);
  const linked = accesses.total - unlinked;
  const steps = tasksWithoutStart.length
    ? ` ${tasksWithoutStart.length} task${tasksWithoutStart.length === 1 ? "" : "s"} couldn't be found in the records: ${tasksWithoutStart.join(", ")}.`
    : "";
  return `${linked} of ${accesses.total} recorded accesses are linked to steps${parts.length ? `; not linked: ${parts.join(", ")}` : ""}.${steps}`;
};
