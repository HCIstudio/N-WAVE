// How a step reads and writes its files, from the I/O monitor's records,
// measured as Witzke et al. do ("Low-level I/O Monitoring for Scientific
// Workflows", arXiv:2408.00411, Fig. 4 and 5).

import type { RunAccesses, TaskFile } from "../api/runs";

/**
 * How long a task read (or wrote) a file, as a share of its running time:
 * their measure of "bulk" against "streaming" access. Near 0, it took the
 * file all at once; near 1, it read (or wrote) it the whole time it ran.
 */
export interface AccessPattern {
  share: number;
  kind: "at once" | "bulk" | "in parts" | "streaming";
}

/** Below this share of the task's time, a file is read or written in bulk. */
export const BULK_BELOW = 0.2;
/** Above this share, it is streamed: read or written as the task goes. */
export const STREAMING_ABOVE = 0.6;

export const accessPattern = (file: TaskFile, type: "R" | "W", duration: number): AccessPattern => {
  const first = type === "R" ? file.firstRead : file.firstWrite;
  const last = type === "R" ? file.lastRead : file.lastWrite;
  const count = type === "R" ? file.reads : file.writes;
  if (first === null || last === null || count <= 1 || duration <= 0) return { share: 0, kind: "at once" };
  const share = Math.min(1, Math.max(0, (last - first) / duration));
  return { share, kind: share < BULK_BELOW ? "bulk" : share > STREAMING_ABOVE ? "streaming" : "in parts" };
};

/** "streaming (82 % of the time)". */
export const describePattern = (pattern: AccessPattern): string =>
  pattern.kind === "at once" ? "at once" : `${pattern.kind} (${Math.round(pattern.share * 100)} % of the time)`;

/** The last part of a path. */
export const fileName = (path: string): string => {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
};

export interface FilePoint {
  /** Epoch seconds. */
  time: number;
  offset: number;
  bytes: number;
  type: "R" | "W";
  /** The task's name, e.g. "STAR_ALIGNMENT (WT_REP1)". */
  task: string;
}

/**
 * Every recorded read and write of one file, by every task of the run, in
 * time order: one step writes it, the next reads it (their Fig. 5). A step
 * reads its input through a link in its own work folder, which the kernel
 * resolves to the file the step before wrote, so the paths are the same.
 */
export const followFile = (accesses: Extract<RunAccesses, { status: "recorded" }>, path: string): FilePoint[] =>
  accesses.tasks
    .flatMap((task) =>
      task.files
        .filter((file) => file.path === path)
        .flatMap((file) =>
          file.samples.map(([time, offset, bytes, type]) => ({ time: task.start + time, offset, bytes, type, task: task.name })),
        ),
    )
    .sort((a, b) => a.time - b.time);

/** The files one task wrote that tasks of another step read: where data goes from step to step. */
export const handedOn = (
  accesses: Extract<RunAccesses, { status: "recorded" }>,
): { path: string; writer: string; readers: string[] }[] => {
  const writers = new Map<string, string>();
  const readers = new Map<string, Set<string>>();
  for (const task of accesses.tasks) {
    for (const file of task.files) {
      if (file.bytesWritten > 0 && !writers.has(file.path)) writers.set(file.path, task.name);
      if (file.bytesRead > 0) readers.set(file.path, (readers.get(file.path) ?? new Set()).add(task.name));
    }
  }
  return [...writers.entries()]
    .map(([path, writer]) => ({ path, writer, readers: [...(readers.get(path) ?? [])].filter((name) => name !== writer) }))
    .filter((entry) => entry.readers.length > 0);
};
