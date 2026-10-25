// Runs a backend left behind. Nextflow doesn't stop with the backend that
// started it: in the Docker setup it runs in a sibling container, and
// locally in a process group of its own. When N-WAVE starts, runs still
// recorded as running belong to no backend anymore, so what is left of them
// is stopped (their history would otherwise say "interrupted" while they
// still write to their folder) and they are recorded as interrupted.

import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { finishRun, listUnfinishedRuns, RUN_LOG_FILE } from "../runs/runIndex";
import { shellQuote } from "./command";
import { registerRun, unregisterRun } from "./runRegistry";
import { STOP_GRACE_MS } from "./runner";
import { removeRunTaskContainers } from "./taskContainers";

export const INTERRUPTED_MESSAGE =
  "Interrupted: N-WAVE stopped while this run went on; what was left of it was stopped when N-WAVE started again. Resume it to reuse the steps it finished.";

const run = (command: string, timeout: number): Promise<boolean> =>
  new Promise((resolve) => exec(command, { timeout }, (error) => resolve(!error)));

const isGroupAlive = (group: number): boolean => {
  try {
    process.kill(-group, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Whether `group` is still the run's Nextflow, not a process that got the
 * same id since: on Linux its working directory is the run's folder.
 */
const isRunProcess = (group: number, dir: string): boolean => {
  try {
    return fs.realpathSync(`/proc/${group}/cwd`) === fs.realpathSync(dir);
  } catch {
    // No /proc (macOS) or no such process: can't tell, so leave it alone.
    return false;
  }
};

const stopGroup = async (group: number): Promise<void> => {
  process.kill(-group, "SIGTERM");
  const deadline = Date.now() + STOP_GRACE_MS;
  while (isGroupAlive(group) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (isGroupAlive(group)) process.kill(-group, "SIGKILL");
};

/** Stop what is left of one run and record it as interrupted. */
export const stopOrphanedRun = async (orphan: ReturnType<typeof listUnfinishedRuns>[number]): Promise<void> => {
  if (orphan.runnerContainer) {
    // Gone already when the run ended with its container (`--rm`).
    await run(
      `docker stop -t ${STOP_GRACE_MS / 1000} ${shellQuote(orphan.runnerContainer)}`,
      STOP_GRACE_MS + 15_000
    );
  }
  if (orphan.processGroup && isGroupAlive(orphan.processGroup) && isRunProcess(orphan.processGroup, orphan.dir)) {
    try {
      await stopGroup(orphan.processGroup);
    } catch (error: unknown) {
      console.warn(`Could not stop run ${orphan.id}'s Nextflow:`, error);
    }
  }
  const removed = await removeRunTaskContainers(path.basename(orphan.dir));
  try {
    fs.appendFileSync(
      path.join(orphan.dir, orphan.log ?? RUN_LOG_FILE),
      `\nN-WAVE: ${INTERRUPTED_MESSAGE}${removed > 0 ? ` Removed ${removed} task container${removed === 1 ? "" : "s"}.` : ""}\n`
    );
  } catch {
    // Its folder may be gone; the history still says what happened.
  }
  finishRun(orphan.id, "failed", INTERRUPTED_MESSAGE);
};

/**
 * Stop what is left of the runs an earlier backend didn't see end. They
 * count as live meanwhile, so nothing resumes in, or clears, their folders.
 */
export const stopOrphanedRuns = async (): Promise<number> => {
  const orphans = listUnfinishedRuns();
  for (const orphan of orphans) registerRun(orphan.id, { stop: () => {} });
  await Promise.all(
    orphans.map((orphan) =>
      stopOrphanedRun(orphan)
        .catch((error: unknown) => console.warn(`Could not stop run ${orphan.id}:`, error))
        .finally(() => unregisterRun(orphan.id))
    )
  );
  return orphans.length;
};
