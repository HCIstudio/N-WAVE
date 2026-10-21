import fs from "node:fs";
import path from "node:path";

/**
 * What a run's tasks are doing, read from Nextflow's own log.
 *
 * The console progress Nextflow prints shortens long process names (an
 * nf-core subworkflow step becomes "SUB…_SORT"), so it can't say which node
 * a task belongs to. `.nextflow.log` has the full names: one line when a
 * task is submitted, one when it finishes, with its exit status and work
 * directory. The work directory also holds the files the task produced.
 */

export type TaskStatus = "running" | "succeeded" | "failed" | "cached";

export interface RunTask {
  /** Nextflow's task hash, e.g. "b7/8cc335" (also its work directory). */
  hash: string;
  /** Full task name, e.g. "ALIGN:SAMTOOLS_SORT (WT_REP1)". */
  name: string;
  /** Process name without the tag, e.g. "ALIGN:SAMTOOLS_SORT". */
  process: string;
  status: TaskStatus;
  exitCode?: number;
}

/** Where a run's Nextflow log is (the backend passes `-log` with this path). */
export const NEXTFLOW_LOG_PATHS = ["nextflow/.nextflow.log", ".nextflow.log"];

const SUBMITTED =
  /\[([0-9a-f]{2}\/[0-9a-f]{6})\] (Submitted|Re-submitted|Cached) process > (.+)$/;
const COMPLETED =
  /Task completed > TaskHandler\[.*?name: (.+?); status: \w+; exit: (\S+); error: (.*?); workDir: (\S+?)\]/;

const processOf = (name: string): string => name.replace(/\s+\(.*\)$/, "");

/** The run's tasks in the order they were submitted. */
export const parseTaskEvents = (log: string): RunTask[] => {
  const tasks = new Map<string, RunTask>();
  for (const line of log.split("\n")) {
    const submitted = line.match(SUBMITTED);
    if (submitted) {
      const [, hash = "", kind, name = ""] = submitted;
      if (kind === "Re-submitted") {
        // A retry (errorStrategy 'retry') replaces the attempt that failed,
        // so a task that later succeeded doesn't count as a failure.
        const retried = [...tasks.values()]
          .reverse()
          .find((task) => task.name === name.trim() && task.status === "failed");
        if (retried) tasks.delete(retried.hash);
      }
      tasks.set(hash, {
        hash,
        name: name.trim(),
        process: processOf(name.trim()),
        status: kind === "Cached" ? "cached" : "running",
      });
      continue;
    }
    const completed = line.match(COMPLETED);
    if (completed) {
      const [, name = "", exit = "", error = "", workDir = ""] = completed;
      const segments = workDir.split(/[\\/]/).filter(Boolean);
      const hash = `${segments.at(-2) ?? ""}/${(segments.at(-1) ?? "").slice(0, 6)}`;
      const exitCode = Number(exit);
      const failed = (Number.isFinite(exitCode) && exitCode !== 0) || error.trim() !== "-";
      const task = tasks.get(hash) ?? {
        hash,
        name: name.trim(),
        process: processOf(name.trim()),
        status: "running" as TaskStatus,
      };
      tasks.set(hash, {
        ...task,
        status: failed ? "failed" : "succeeded",
        ...(Number.isFinite(exitCode) ? { exitCode } : {}),
      });
    }
  }
  return [...tasks.values()];
};

/** The run's tasks, or [] when Nextflow hasn't written its log yet. */
export const readRunTasks = (runDir: string, nextflowLog?: string): RunTask[] => {
  // A resumed run has its own log in the shared folder.
  for (const relative of nextflowLog ? [nextflowLog] : NEXTFLOW_LOG_PATHS) {
    const file = path.join(runDir, relative);
    if (fs.existsSync(file)) return parseTaskEvents(fs.readFileSync(file, "utf8"));
  }
  return [];
};

const HASH = /^([0-9a-f]{2})\/([0-9a-f]{6})$/;

/** A task's work directory inside the run, or null. */
export const findTaskWorkDir = (runDir: string, hash: string): string | null => {
  const match = hash.match(HASH);
  if (!match) return null;
  const [, prefix = "", rest = ""] = match;
  const parent = path.join(runDir, "nextflow", "work", prefix);
  if (!fs.existsSync(parent)) return null;
  const entry = fs
    .readdirSync(parent, { withFileTypes: true })
    .find((candidate) => candidate.isDirectory() && candidate.name.startsWith(rest));
  return entry ? path.join(parent, entry.name) : null;
};

/**
 * Files a task produced: regular files in its work directory, without
 * Nextflow's own `.command.*` files and the inputs it staged (symlinks).
 */
export const listTaskOutputs = (
  workDir: string,
  limit = 500
): Array<{ path: string; size: number }> => {
  const files: Array<{ path: string; size: number }> = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= limit || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        files.push({
          path: path.relative(workDir, full).split(path.sep).join("/"),
          size: fs.statSync(full).size,
        });
      }
    }
  };
  walk(workDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
};
