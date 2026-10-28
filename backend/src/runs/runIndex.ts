import fs from "node:fs";
import path from "node:path";
import { getNwaveDataRoot } from "../execution/nfcoreModules";
import { readJsonFile, writeJsonFile } from "../utils/jsonFile";

// Runs started by this backend, by execution id, so their results can be
// listed and served later (e.g. a pipeline's MultiQC report). Only run
// directories recorded here are ever served.

const MAX_RUNS = 500;

export type RunStatus = "running" | "succeeded" | "failed" | "cancelled";

interface RunRecord {
  dir: string;
  startedAt: string;
  workflowId?: string;
  workflowName?: string;
  /** Missing on runs recorded before statuses were kept. */
  status?: RunStatus;
  finishedAt?: string;
  /** Why a run failed, in one line. */
  message?: string;
  /** The run's own log files, relative to `dir`, when not the defaults (a resumed run shares its folder). */
  log?: string;
  nextflowLog?: string;
  /** The run it resumed, in the same folder. */
  resumedFrom?: string;
  /** While it runs: what to stop if the backend goes away (see runs/orphanedRuns.ts). */
  processGroup?: number;
  runnerContainer?: string;
}

export interface RunSummary {
  id: string;
  workflowId?: string;
  workflowName?: string;
  status: RunStatus | "unknown";
  startedAt: string;
  finishedAt?: string;
  message?: string;
  /** Set on a run that resumed an earlier one. */
  resumedFrom?: string;
}

/** The run's full output (what the run panel showed), in its directory. */
export const RUN_LOG_FILE = "nwave-run.log";

const indexPath = (): string => path.join(getNwaveDataRoot(), "runs.json");

const readIndex = (): Record<string, RunRecord> =>
  readJsonFile<Record<string, RunRecord>>(indexPath(), {});

const writeIndex = (entries: Array<[string, RunRecord]>): void => {
  writeJsonFile(indexPath(), Object.fromEntries(entries.slice(-MAX_RUNS)));
};

/** Remember a run's directory as running (keeps the newest MAX_RUNS). */
export const recordRun = (
  id: string,
  dir: string,
  meta: Pick<RunRecord, "workflowId" | "workflowName" | "log" | "nextflowLog" | "resumedFrom"> = {}
): void => {
  const entries = Object.entries(readIndex()).filter(([runId]) => runId !== id);
  const defined = Object.fromEntries(Object.entries(meta).filter(([, value]) => value));
  entries.push([
    id,
    {
      dir,
      startedAt: new Date().toISOString(),
      ...defined,
      status: "running",
    },
  ]);
  writeIndex(entries);
};

/** Record what a started run's Nextflow is: its process group and runner container. */
export const recordRunProcess = (
  id: string,
  process: Pick<RunRecord, "processGroup" | "runnerContainer">
): void => {
  const index = readIndex();
  const run = index[id];
  if (!run) return;
  const defined = Object.fromEntries(Object.entries(process).filter(([, value]) => value));
  index[id] = { ...run, ...defined };
  writeIndex(Object.entries(index));
};

/** Runs recorded as running, with what to stop of them. */
export const listUnfinishedRuns = (): Array<
  { id: string } & Pick<RunRecord, "dir" | "processGroup" | "runnerContainer" | "log">
> =>
  Object.entries(readIndex())
    .filter(([, run]) => run.status === "running")
    .map(([id, run]) => ({
      id,
      dir: run.dir,
      ...(run.processGroup ? { processGroup: run.processGroup } : {}),
      ...(run.runnerContainer ? { runnerContainer: run.runnerContainer } : {}),
      ...(run.log ? { log: run.log } : {}),
    }));

/** Record how a run ended. */
export const finishRun = (
  id: string,
  status: Exclude<RunStatus, "running">,
  message?: string
): void => {
  const index = readIndex();
  const run = index[id];
  if (!run) return;
  const { processGroup: _group, runnerContainer: _container, ...rest } = run;
  index[id] = {
    ...rest,
    status,
    finishedAt: new Date().toISOString(),
    ...(message ? { message: message.slice(0, 500) } : {}),
  };
  writeIndex(Object.entries(index));
};

/**
 * Recorded runs, newest first, optionally of one workflow. `isLive` tells
 * whether a "running" run is still going (it isn't after a restart).
 */
export const listRuns = (
  options: { workflowId?: string; limit?: number; isLive?: (id: string) => boolean } = {}
): RunSummary[] =>
  Object.entries(readIndex())
    .filter(
      ([, run]) => !options.workflowId || run.workflowId === options.workflowId
    )
    .reverse()
    .slice(0, options.limit ?? 50)
    .map(([id, run]) => ({
      id,
      ...(run.workflowId ? { workflowId: run.workflowId } : {}),
      ...(run.workflowName ? { workflowName: run.workflowName } : {}),
      status:
        run.status === "running" && options.isLive && !options.isLive(id)
          ? "failed"
          : (run.status ?? "unknown"),
      startedAt: run.startedAt,
      ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
      ...(run.status === "running" && options.isLive && !options.isLive(id)
        ? { message: "The run was interrupted (the server stopped)." }
        : run.message
          ? { message: run.message }
          : {}),
      ...(run.resumedFrom ? { resumedFrom: run.resumedFrom } : {}),
    }));

/**
 * The run a new run of the workflow resumes: its newest run whose folder
 * still has Nextflow's cache, or null.
 */
export const findResumableRun = (workflowId: string): { id: string; dir: string } | null => {
  const entries = Object.entries(readIndex()).reverse();
  for (const [id, run] of entries) {
    if (run.workflowId !== workflowId) continue;
    const hasCache = [".nextflow", "nextflow/.nextflow"].some((cache) =>
      fs.existsSync(path.join(run.dir, cache, "history"))
    );
    if (hasCache) return { id, dir: run.dir };
  }
  return null;
};

/** The folders of a workflow's recorded runs that still exist. */
export const listWorkflowRunDirs = (workflowId: string): string[] => [
  ...new Set(
    Object.values(readIndex())
      .filter((run) => run.workflowId === workflowId && fs.existsSync(run.dir))
      .map((run) => run.dir)
  ),
];

/** The folders of all recorded runs that still exist, with the workflow each belongs to. */
export const listAllRunDirs = (): Array<{ dir: string; workflowId?: string }> => {
  const dirs = new Map<string, string | undefined>();
  for (const run of Object.values(readIndex())) {
    if (!dirs.has(run.dir) && fs.existsSync(run.dir)) dirs.set(run.dir, run.workflowId);
  }
  return [...dirs].map(([dir, workflowId]) => ({ dir, workflowId }));
};

/** Whether a run that is still going uses `dir`. */
export const isRunDirInUse = (dir: string, isLive: (id: string) => boolean): boolean =>
  Object.entries(readIndex()).some(([id, run]) => run.dir === dir && isLive(id));

/** A recorded run's log file, or null. */
export const findRunLog = (id: string): string | null => {
  const run = readIndex()[id];
  if (!run) return null;
  const file = path.join(run.dir, run.log ?? RUN_LOG_FILE);
  return fs.existsSync(file) ? file : null;
};

/** A recorded run's Nextflow log, relative to its folder, when it has its own. */
export const findRunNextflowLog = (id: string): string | undefined =>
  readIndex()[id]?.nextflowLog;

/** A recorded run's directory, or null. */
export const findRunDir = (id: string): string | null => {
  const run = readIndex()[id];
  return run && fs.existsSync(run.dir) ? run.dir : null;
};

/** The results directory of a recorded run, or null. */
export const findRunResultsDir = (id: string): string | null => {
  const run = readIndex()[id];
  if (!run) return null;
  const dir = path.join(run.dir, "results");
  return fs.existsSync(dir) ? dir : null;
};

/**
 * `target`'s real path when, after following symlinks, it is a file inside
 * `runDir` (also resolved), or null. Nextflow's links into the run's own
 * work/ resolve inside it; links elsewhere don't.
 */
export const realFileInRun = (runDir: string, target: string): string | null => {
  try {
    const real = fs.realpathSync(target);
    if (!real.startsWith(`${fs.realpathSync(runDir)}${path.sep}`)) return null;
    return fs.statSync(real).isFile() ? real : null;
  } catch {
    // Missing (ENOENT), a link loop or unreadable: not there to serve.
    return null;
  }
};

/**
 * Files under `root` (relative, "/"-separated), up to `limit`. Symlinks are
 * listed when they lead to a file inside `runDir` (Nextflow publishes
 * results as symlinks into work/ by default).
 */
export const listFiles = (
  root: string,
  limit = 5_000,
  runDir = root
): Array<{ path: string; size: number }> => {
  const files: Array<{ path: string; size: number }> = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= limit) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() || entry.isSymbolicLink()) {
        const real = entry.isFile() ? full : realFileInRun(runDir, full);
        if (!real) continue;
        files.push({
          path: path.relative(root, full).split(path.sep).join("/"),
          size: fs.statSync(real).size,
        });
      }
    }
  };
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
};
