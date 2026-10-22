import fs from "node:fs";
import path from "node:path";
import { isRunDirInUse, listWorkflowRunDirs } from "./runIndex";

// A workflow's run cache: what Nextflow keeps in its runs' folders so a
// resumed run can reuse the steps that haven't changed. That is each task's
// work directory (nextflow/work) and Nextflow's record of them (.nextflow,
// moved to nextflow/.nextflow after a successful run). Results, inputs and
// logs are not part of it.

const CACHE_PATHS = ["nextflow/work", ".nextflow", "nextflow/.nextflow"];

/** Bytes under `target`, without following symlinks (task inputs are links). */
const sizeOf = async (target: string): Promise<number> => {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.lstat(target);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.isFile() ? stat.size : 0;
  const entries = await fs.promises.readdir(target).catch(() => []);
  let total = 0;
  for (const entry of entries) total += await sizeOf(path.join(target, entry));
  return total;
};

export interface WorkflowCache {
  /** Bytes the cache takes up on disk. */
  bytes: number;
  /** Run folders that hold some of it. */
  folders: number;
}

/** How much a workflow's run cache takes up. */
export const measureWorkflowCache = async (workflowId: string): Promise<WorkflowCache> => {
  let bytes = 0;
  let folders = 0;
  for (const dir of listWorkflowRunDirs(workflowId)) {
    const present = CACHE_PATHS.map((cache) => path.join(dir, cache)).filter((cache) =>
      fs.existsSync(cache)
    );
    if (present.length === 0) continue;
    folders += 1;
    for (const cache of present) bytes += await sizeOf(cache);
  }
  return { bytes, folders };
};

// Workflows whose cache is being deleted: a run starting meanwhile mustn't
// resume in a folder whose cache is about to go.
const clearing = new Set<string>();

/** Whether the workflow's cache is being deleted right now. */
export const isClearingWorkflowCache = (workflowId: string): boolean =>
  clearing.has(workflowId);

/**
 * Delete a workflow's run cache, so its next run starts from scratch.
 * Throws while one of its runs is still going.
 */
export const clearWorkflowCache = async (
  workflowId: string,
  isLive: (id: string) => boolean
): Promise<void> => {
  const dirs = listWorkflowRunDirs(workflowId);
  if (dirs.some((dir) => isRunDirInUse(dir, isLive))) {
    throw new WorkflowCacheInUseError();
  }
  clearing.add(workflowId);
  try {
    for (const dir of dirs) {
      for (const cache of CACHE_PATHS) {
        await fs.promises.rm(path.join(dir, cache), { recursive: true, force: true });
      }
    }
  } finally {
    clearing.delete(workflowId);
  }
};

export class WorkflowCacheInUseError extends Error {
  constructor() {
    super("A run of this workflow is still going; clear its cache when it has ended.");
  }
}
