// Which step made each file access the I/O monitor recorded: N-WAVE's own
// implementation of the method of Witzke et al. ("Low-level I/O Monitoring
// for Scientific Workflows", https://arxiv.org/abs/2408.00411, section 5).
//
// - Each task's work directory comes from Nextflow's log.
// - The task's first process is the one that opens the task's .command.sh
//   in that directory for reading.
// - Docker gives each task container its own cgroup, so all processes of the
//   task share that process's cgroup; the monitor's process log records it.
// - Every access by a process in that cgroup belongs to the task, and the
//   task belongs to its canvas node.
//
// The process log records, at each fork, the forking process's cgroup. So a
// process's cgroup is known exactly from the forks it makes itself, and
// otherwise inherited from its parent at its own fork (a container's first
// process is forked outside the container's cgroup and moved into it, so
// for it only its own forks tell).

/** One file access from the monitor's log (file-bpf.csv). */
export interface MonitorAccess {
  /** Seconds (epoch, ms precision). */
  time: number;
  timeEnd: number;
  pid: number;
  /** The monitor's unique id of the file (the kernel reuses inode numbers). */
  inode: number;
  /** O open, C close, R read, W write, U unlink (delete). */
  type: "O" | "C" | "R" | "W" | "U";
  /** Bytes read or written (or the call's result). */
  result: number;
  handle: number;
  offset: number;
  size: number;
  flags: number;
  /** The path as the kernel names it (opens and deletes only). */
  path: string;
}

/** One fork from the monitor's process log (cgroups.csv). */
export interface MonitorFork {
  time: number;
  ppid: number;
  pid: number;
  /** The forking process's cgroup at the time. */
  cgroup: string;
}

const TYPES = new Set(["O", "C", "R", "W", "U"]);

/** Parses file-bpf.csv (their format: fixed-width columns, the path last and possibly with commas). */
export const parseAccessLog = (text: string): MonitorAccess[] => {
  const accesses: MonitorAccess[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim() || line.startsWith("#") || line.startsWith("time")) continue;
    const fields = line.split(",");
    if (fields.length < 15) continue;
    const type = (fields[8] ?? "").trim();
    if (!TYPES.has(type)) continue;
    // The path: the rest of the line, up to their ':' (mount and super block follow).
    const path = fields.slice(14).join(",").trim().split(":")[0] ?? "";
    accesses.push({
      time: Number(fields[0]),
      timeEnd: Number(fields[1]),
      pid: Number(fields[2]),
      inode: Number(fields[7]),
      type: type as MonitorAccess["type"],
      result: Number(fields[9]),
      handle: Number(fields[10]),
      offset: Number(fields[11]),
      size: Number(fields[12]),
      flags: Number.parseInt((fields[13] ?? "0").trim(), 16),
      path,
    });
  }
  return accesses;
};

/**
 * Parses cgroups.csv (time, ppid, pid, cgroupid). Its times are in
 * microseconds (file-bpf.csv's in seconds); they are returned in seconds.
 */
export const parseForkLog = (text: string): MonitorFork[] => {
  const forks: MonitorFork[] = [];
  for (const line of text.split("\n")) {
    const fields = line.split(",").map((field) => field.trim());
    if (fields.length < 4 || !/^\d/.test(fields[0] ?? "")) continue;
    forks.push({ time: Number(fields[0]) / 1e6, ppid: Number(fields[1]), pid: Number(fields[2]), cgroup: fields[3] ?? "" });
  }
  return forks;
};

interface Observation {
  time: number;
  cgroup: string;
  /** Seen as the forking process (exact) or as the forked one (inherited). */
  own: boolean;
}

/** A process's cgroup at a time, from the forks. */
export class CgroupIndex {
  private readonly byPid = new Map<number, Observation[]>();

  constructor(forks: MonitorFork[]) {
    for (const fork of forks) {
      this.add(fork.ppid, { time: fork.time, cgroup: fork.cgroup, own: true });
      this.add(fork.pid, { time: fork.time, cgroup: fork.cgroup, own: false });
    }
    for (const list of this.byPid.values()) list.sort((a, b) => a.time - b.time);
  }

  private add(pid: number, observation: Observation): void {
    const list = this.byPid.get(pid);
    if (list) list.push(observation);
    else this.byPid.set(pid, [observation]);
  }

  /**
   * The cgroup of `pid` at `time`. Process ids get reused, so only the
   * process's life around that time counts: from its fork (the last one
   * that created this pid before `time`) on. Its own forks win over what it
   * inherited.
   */
  at(pid: number, time: number): string | undefined {
    const list = this.byPid.get(pid);
    if (!list) return undefined;
    // The life of the process: from its last creation at or before `time`
    // (or the start of the log) until the next creation of the same pid.
    let start = -Infinity;
    let end = Infinity;
    for (const observation of list) {
      if (!observation.own) {
        if (observation.time <= time) start = observation.time;
        else if (observation.time > time) {
          end = observation.time;
          break;
        }
      }
    }
    const life = list.filter((observation) => observation.time >= start && observation.time < end);
    // Its own forks: the last one at or before `time`, else the first after.
    const own = life.filter((observation) => observation.own);
    const before = own.filter((observation) => observation.time <= time).at(-1);
    if (before) return before.cgroup;
    const after = own[0];
    if (after) return after.cgroup;
    return life.find((observation) => !observation.own)?.cgroup;
  }
}

/** A task as Nextflow's log names it. */
export interface LinkTask {
  /** e.g. "ab/cdef12" (the short hash, as N-WAVE's run tasks have it). */
  hash: string;
  name: string;
  process: string;
}

/** What one task did with one file. */
export interface TaskFile {
  /** The path relative to the run's folder (or as recorded, if outside it). */
  path: string;
  inode: number;
  bytesRead: number;
  bytesWritten: number;
  reads: number;
  writes: number;
  /** The highest offset reached (a lower bound on the file's size). */
  size: number;
  /** Seconds since the task's first access. */
  firstAccess: number;
  lastAccess: number;
  firstRead: number | null;
  lastRead: number | null;
  firstWrite: number | null;
  lastWrite: number | null;
  /** Deleted by the task. */
  deleted: boolean;
  /**
   * Its reads and writes over time, for following a file from step to step:
   * [seconds since the task's first access, offset, bytes, "R" | "W"]. At
   * most MAX_SAMPLES, evenly spread, with the first and last.
   */
  samples: [number, number, number, "R" | "W"][];
}

/** Reads and writes kept per file and task for the offsets over time. */
export const MAX_SAMPLES = 300;

/** At most `max` of `items`, evenly spread, keeping the first and the last. */
export const thin = <T>(items: T[], max: number): T[] => {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)] as T);
};

export interface LinkedTask extends LinkTask {
  cgroup: string;
  pids: number;
  /** The task's first and last recorded access (epoch seconds). */
  start: number;
  end: number;
  files: TaskFile[];
}

export interface Unlinked {
  /** Accesses by processes outside every task's cgroup (Nextflow, Docker, …). */
  outsideTasks: number;
  /** Tasks whose .command.sh wasn't seen opened, so whose cgroup is unknown. */
  tasksWithoutStart: string[];
  /** Accesses by processes the process log doesn't know (started before the monitor). */
  unknownProcess: number;
  /**
   * Accesses by a task to a file whose open (and so path) the monitor didn't
   * record, or recorded outside the run's folder (their filter lets some by).
   */
  unknownFile: number;
}

export interface LinkResult {
  tasks: LinkedTask[];
  unlinked: Unlinked;
  /** All accesses in the log. */
  total: number;
}

/** The task directory a path is in: "ab/cdef…" after a "work" folder, or null. */
export const taskDirOf = (path: string): { dir: string; rest: string } | null => {
  const match = path.match(/\/work\/([0-9a-f]{2})\/([0-9a-f]{30})(?:\/(.*))?$/);
  return match ? { dir: `${match[1]}/${match[2]}`, rest: match[3] ?? "" } : null;
};

/**
 * Whether a path in the run's folder is two paths run together: the monitor
 * sometimes assembles an open's path from the parts of two (their path ids
 * repeat on a busy computer), e.g. ".../out.bam/home/user/results/..." or
 * ".command.out/data/desktop-containerd/...". Such a path names no file.
 */
export const isSplicedPath = (relative: string, runFolder?: string): boolean => {
  const root = runFolder?.split("/").filter(Boolean).slice(0, 2).join("/");
  if (root && relative.includes(`/${root}/`)) return true;
  if (/\/(data\/desktop-containerd|proc|sys|usr|etc|var\/lib\/docker)\//.test(relative)) return true;
  // Nextflow's own files are files, never folders.
  return /(^|\/)\.command\.(sh|run|out|err|log|trace|begin|env)\/|\.exitcode\//.test(relative);
};

/** At least this share of a cgroup's opens in task directories are in one task's, for it to be that task's. */
const SHARE_OF_OWN = 0.5;

/** How much the paper's sign (.command.sh opened for reading) counts against other opens. */
const ANCHOR_WEIGHT = 10;

/** O_ACCMODE: 0 read-only. */
const isReadOnly = (flags: number) => (flags & 0b11) === 0;

/**
 * Links the monitor's accesses to the run's tasks. `runFolder` is the run's
 * folder as the kernel names it (paths are made relative to it).
 */
export const linkAccesses = (
  accesses: MonitorAccess[],
  forks: MonitorFork[],
  tasks: LinkTask[],
  runFolder?: string,
): LinkResult => {
  const cgroups = new CgroupIndex(forks);
  const byShortHash = new Map(tasks.map((task) => [task.hash, task]));
  const relative = (path: string) => {
    if (runFolder && path.startsWith(`${runFolder}/`)) return path.slice(runFolder.length + 1);
    const inRun = path.match(/\/(work\/[0-9a-f]{2}\/[0-9a-f]{30}\/.*)$/);
    return inRun ? (inRun[1] as string) : path;
  };

  // 1. Each task's cgroup. The paper's sign is the process that opens the
  // task's .command.sh for reading. On a busy computer the monitor loses
  // or mislabels some opens, so N-WAVE also counts the other files opened
  // in the task's directory (.command.out, .command.trace, .exitcode, its
  // outputs), except those Nextflow writes itself (.command.sh and
  // .command.run): the cgroup that opens the most there is the task's.
  // A cgroup that would win several tasks is Nextflow's own container.
  const votes = new Map<string, Map<string, number>>();
  // When each cgroup first shows in the process log, and when the monitor started.
  const firstSeen = new Map<string, number>();
  for (const fork of forks) if (!firstSeen.has(fork.cgroup) || (firstSeen.get(fork.cgroup) as number) > fork.time) firstSeen.set(fork.cgroup, fork.time);
  const monitorStart = Math.min(...forks.map((fork) => fork.time), ...accesses.slice(0, 1).map((access) => access.time));
  for (const access of accesses) {
    if (access.type !== "O" || access.result < 0) continue;
    const dir = taskDirOf(access.path);
    if (!dir) continue;
    // Only the directory's own files count: a task also reads other tasks'
    // outputs (MultiQC reads them all), and only Nextflow and the task open
    // these.
    if (!/^(\.command\.(sh|run|begin|out|err|log|trace|env)|\.exitcode)$/.test(dir.rest)) continue;
    const task = byShortHash.get(dir.dir.slice(0, 9));
    if (!task) continue;
    // Nextflow writes .command.sh and .command.run; the task's bash reads them.
    const script = dir.rest === ".command.sh" || dir.rest === ".command.run";
    if (script && !isReadOnly(access.flags)) continue;
    const cgroup = cgroups.at(access.pid, access.time);
    if (cgroup === undefined) continue;
    const weight = script ? ANCHOR_WEIGHT : 1;
    const forTask = votes.get(task.hash) ?? new Map<string, number>();
    forTask.set(cgroup, (forTask.get(cgroup) ?? 0) + weight);
    votes.set(task.hash, forTask);
  }
  // A cgroup that would win several tasks is Nextflow's own container (or
  // tasks ran without containers of their own and share it). And a task's
  // container opens files mostly in its own directory: a cgroup with less
  // than SHARE_OF_OWN of its opens in one task's directory isn't a task's.
  const spread = new Map<string, { total: number; most: number }>();
  const wins = new Map<string, number>();
  for (const forTask of votes.values()) {
    const best = [...forTask.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) wins.set(best[0], (wins.get(best[0]) ?? 0) + 1);
    for (const [cgroup, count] of forTask) {
      const entry = spread.get(cgroup) ?? { total: 0, most: 0 };
      entry.total += count;
      entry.most = Math.max(entry.most, count);
      spread.set(cgroup, entry);
    }
  }
  const shared = new Set([
    ...[...wins.entries()].filter(([, count]) => count > 1).map(([cgroup]) => cgroup),
    ...[...spread.entries()].filter(([, entry]) => entry.most < SHARE_OF_OWN * entry.total).map(([cgroup]) => cgroup),
  ]);
  const taskByCgroup = new Map<string, LinkTask>();
  const cgroupOfTask = new Map<string, string>();
  // Strongest pairs first, each task and each cgroup once.
  const pairs = [...votes.entries()]
    .flatMap(([hash, forTask]) => [...forTask.entries()].map(([cgroup, count]) => ({ hash, cgroup, count })))
    // A task's container is made during the run: a cgroup there from the
    // monitor's start is the computer's own (its opens here are paths the
    // monitor mislabeled).
    .filter((pair) => !shared.has(pair.cgroup) && (firstSeen.get(pair.cgroup) ?? 0) > monitorStart + 1)
    .sort((a, b) => b.count - a.count);
  for (const { hash, cgroup } of pairs) {
    const task = byShortHash.get(hash);
    if (!task || cgroupOfTask.has(hash) || taskByCgroup.has(cgroup)) continue;
    cgroupOfTask.set(hash, cgroup);
    taskByCgroup.set(cgroup, task);
  }

  // 2. Every access by a process in a task's cgroup belongs to that task.
  const linked = new Map<string, { task: LinkTask; cgroup: string; pids: Set<number>; files: Map<string, TaskFile>; start: number; end: number }>();
  const pathOfInode = new Map<number, string>();
  // The latest open of each handle (their handle ids get reused): a read or
  // write belongs to the file its handle was last opened for.
  const openOfHandle = new Map<number, { path: string; inode: number }>();
  const unlinked: Unlinked = { outsideTasks: 0, tasksWithoutStart: [], unknownProcess: 0, unknownFile: 0 };
  const sorted = [...accesses].sort((a, b) => a.time - b.time);
  for (const access of sorted) {
    if ((access.type === "O" || access.type === "U") && access.path) pathOfInode.set(access.inode, access.path);
    if (access.type === "O" && access.path) openOfHandle.set(access.handle, { path: access.path, inode: access.inode });
    const cgroup = cgroups.at(access.pid, access.time);
    const task = cgroup !== undefined ? taskByCgroup.get(cgroup) : undefined;
    if (!task) {
      if (cgroup === undefined) unlinked.unknownProcess += 1;
      else unlinked.outsideTasks += 1;
      continue;
    }
    const opened = access.type === "O" ? { path: access.path, inode: access.inode } : openOfHandle.get(access.handle);
    const path = opened?.path ?? pathOfInode.get(access.inode) ?? access.path;
    const fileKey = opened?.inode ?? access.inode;
    if (
      !path ||
      (runFolder !== undefined && !path.startsWith(`${runFolder}/`)) ||
      isSplicedPath(relative(path), runFolder)
    ) {
      unlinked.unknownFile += 1;
      continue;
    }
    let entry = linked.get(task.hash);
    if (!entry) {
      entry = { task, cgroup: cgroupOfTask.get(task.hash) ?? "", pids: new Set(), files: new Map(), start: access.time, end: access.timeEnd };
      linked.set(task.hash, entry);
    }
    entry.pids.add(access.pid);
    entry.end = Math.max(entry.end, access.timeEnd);
    // One entry per path: a file deleted and written again, or replaced by a
    // rename, is a new file to the monitor but the same file to the task.
    const filePath = relative(path);
    let file = entry.files.get(filePath);
    if (!file) {
      file = {
        path: filePath,
        inode: fileKey,
        bytesRead: 0,
        bytesWritten: 0,
        reads: 0,
        writes: 0,
        size: 0,
        firstAccess: access.time,
        lastAccess: access.time,
        firstRead: null,
        lastRead: null,
        firstWrite: null,
        lastWrite: null,
        deleted: false,
        samples: [],
      };
      entry.files.set(filePath, file);
    }
    file.lastAccess = Math.max(file.lastAccess, access.time);
    // A read or write that returned bytes (their check: 0 < result <= size).
    const transferred = access.result > 0 && access.result <= access.size ? access.result : 0;
    if ((access.type === "R" || access.type === "W") && transferred > 0) {
      file.samples.push([access.time, access.offset, transferred, access.type]);
    }
    if (access.type === "R" && transferred > 0) {
      file.bytesRead += transferred;
      file.reads += 1;
      file.firstRead ??= access.time;
      file.lastRead = access.time;
      file.size = Math.max(file.size, access.offset + transferred);
    } else if (access.type === "W" && transferred > 0) {
      file.bytesWritten += transferred;
      file.writes += 1;
      file.firstWrite ??= access.time;
      file.lastWrite = access.time;
      file.size = Math.max(file.size, access.offset + transferred);
    } else if (access.type === "U") {
      file.deleted = true;
    }
    // Opened again after a delete: the task made it anew. (Writes don't count:
    // a program can keep writing to a file it opened and then deleted.)
    if (access.type === "O") file.deleted = false;
  }
  unlinked.tasksWithoutStart = tasks
    .filter((task) => !cgroupOfTask.has(task.hash))
    .map((task) => task.name);

  const result: LinkedTask[] = [...linked.values()].map((entry) => ({
    ...entry.task,
    cgroup: entry.cgroup,
    pids: entry.pids.size,
    start: entry.start,
    end: entry.end,
    files: [...entry.files.values()]
      .map((file) => ({
        ...file,
        firstAccess: file.firstAccess - entry.start,
        lastAccess: file.lastAccess - entry.start,
        firstRead: file.firstRead === null ? null : file.firstRead - entry.start,
        lastRead: file.lastRead === null ? null : file.lastRead - entry.start,
        firstWrite: file.firstWrite === null ? null : file.firstWrite - entry.start,
        lastWrite: file.lastWrite === null ? null : file.lastWrite - entry.start,
        samples: thin(file.samples, MAX_SAMPLES).map(
          ([time, offset, bytes, type]) => [Math.round((time - entry.start) * 1000) / 1000, offset, bytes, type] as [number, number, number, "R" | "W"],
        ),
      }))
      .sort((a, b) => b.bytesRead + b.bytesWritten - (a.bytesRead + a.bytesWritten)),
  }));
  return { tasks: result, unlinked, total: accesses.length };
};
