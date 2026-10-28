// What a run's trace says: how long it and each of its steps took, the
// slowest steps, how much memory they used against what they asked for, and
// which tasks were cached, retried or failed.

import type { TraceTask } from "../api/runs";

/** A step that used at least this share of its memory is close to its limit. */
export const MEMORY_WARNING_SHARE = 0.9;

export interface ProcessTrace {
  /** Nextflow's full name, e.g. "NFCORE_RNASEQ:RNASEQ:FASTQC". */
  process: string;
  /** Its own name, e.g. "FASTQC". */
  label: string;
  tasks: number;
  cached: number;
  failed: number;
  /** Failed, but the process lets the run go on. */
  ignored: number;
  /** Tasks that ran again after a failed attempt. */
  retried: number;
  /** Running time of its tasks together, and of the longest one (ms). */
  totalRealtime: number;
  longestRealtime: number;
  /** When its first task started and its last ended (epoch ms). */
  start: number | null;
  end: number | null;
  /** The most memory a task used, and what that task asked for (bytes). */
  peakRss: number | null;
  memory: number | null;
  /** The highest peak memory / requested memory of its tasks (0–1+). */
  memoryShare: number | null;
}

export interface TraceSummary {
  /** From the first task's start to the last one's end (ms). */
  wallTime: number;
  /** CPU time used: realtime × CPU share, summed (hours). */
  cpuHours: number;
  tasks: number;
  cached: number;
  failed: number;
  ignored: number;
  retried: number;
  start: number | null;
  end: number | null;
  /** Slowest first (by running time of its tasks together). */
  processes: ProcessTrace[];
}

const lastPart = (process: string) => process.split(":").pop() ?? process;

const minOf = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.min(a, b);
const maxOf = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.max(a, b);

/**
 * Sum up a trace. `ignoredHashes` are tasks the log says failed with their
 * error ignored (the trace only says FAILED).
 */
export const summarizeTrace = (
  tasks: TraceTask[],
  ignoredHashes: ReadonlySet<string> = new Set(),
): TraceSummary => {
  const byProcess = new Map<string, ProcessTrace>();
  let cpuMs = 0;
  for (const task of tasks) {
    const entry =
      byProcess.get(task.process) ??
      ({
        process: task.process,
        label: lastPart(task.process),
        tasks: 0,
        cached: 0,
        failed: 0,
        ignored: 0,
        retried: 0,
        totalRealtime: 0,
        longestRealtime: 0,
        start: null,
        end: null,
        peakRss: null,
        memory: null,
        memoryShare: null,
      } satisfies ProcessTrace);
    entry.tasks += 1;
    const cached = task.status === "CACHED";
    if (cached) entry.cached += 1;
    if (task.status === "FAILED" || task.status === "ABORTED") {
      if (ignoredHashes.has(task.hash)) entry.ignored += 1;
      else entry.failed += 1;
    }
    if (task.attempt > 1) entry.retried += 1;
    // A cached task ran in an earlier run: its times aren't this run's.
    if (!cached) {
      const realtime = task.realtime ?? 0;
      entry.totalRealtime += realtime;
      entry.longestRealtime = Math.max(entry.longestRealtime, realtime);
      entry.start = minOf(entry.start, task.start);
      entry.end = maxOf(entry.end, task.complete);
      cpuMs += realtime * ((task.cpu ?? 0) / 100);
    }
    if (task.peakRss !== null && (entry.peakRss === null || task.peakRss > entry.peakRss)) {
      entry.peakRss = task.peakRss;
      entry.memory = task.memory;
    }
    if (task.peakRss !== null && task.memory) {
      const share = task.peakRss / task.memory;
      entry.memoryShare = Math.max(entry.memoryShare ?? 0, share);
    }
    byProcess.set(task.process, entry);
  }
  const processes = [...byProcess.values()].sort((a, b) => b.totalRealtime - a.totalRealtime);
  // Name a process by its last two parts where two share the last one.
  const shared = new Set(
    processes
      .filter((entry) => processes.some((other) => other !== entry && other.label === entry.label))
      .map((entry) => entry.process),
  );
  for (const entry of processes) {
    if (shared.has(entry.process)) entry.label = entry.process.split(":").slice(-2).join(":");
  }
  const start = processes.reduce<number | null>((value, entry) => minOf(value, entry.start), null);
  const end = processes.reduce<number | null>((value, entry) => maxOf(value, entry.end), null);
  const total = (key: "cached" | "failed" | "ignored" | "retried") =>
    processes.reduce((sum, entry) => sum + entry[key], 0);
  return {
    wallTime: start !== null && end !== null ? end - start : 0,
    cpuHours: cpuMs / 3_600_000,
    tasks: tasks.length,
    cached: total("cached"),
    failed: total("failed"),
    ignored: total("ignored"),
    retried: total("retried"),
    start,
    end,
    processes,
  };
};
