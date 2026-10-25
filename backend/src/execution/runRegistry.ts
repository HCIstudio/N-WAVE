// The runs going on right now, by run id, so they can be cancelled and
// listed as live.

import type { RunHandle } from "./runner";

const liveRuns = new Map<string, RunHandle>();

/** Docker name of a run's Nextflow runner container, so it can be stopped. */
export const runnerContainerName = (runId: string): string =>
  `nwave-run-${runId}`;

export const registerRun = (runId: string, run: RunHandle): void => {
  liveRuns.set(runId, run);
};

export const unregisterRun = (runId: string): void => {
  liveRuns.delete(runId);
};

export const getLiveRun = (runId: string): RunHandle | undefined =>
  liveRuns.get(runId);

export const isRunLive = (runId: string): boolean => liveRuns.has(runId);

/**
 * Stop every live run because the backend shuts down, and wait (at most
 * `timeoutMs`) until they have ended and recorded how. Runs still going then
 * are stopped by the next backend (see orphanedRuns.ts).
 */
export const stopAllRuns = async (timeoutMs: number): Promise<number> => {
  const count = liveRuns.size;
  for (const run of liveRuns.values()) run.stop("shutdown");
  const deadline = Date.now() + timeoutMs;
  while (liveRuns.size > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return count;
};
