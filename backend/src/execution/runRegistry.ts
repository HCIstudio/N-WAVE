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
