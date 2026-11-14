import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { CgroupIndex, isSplicedPath, linkAccesses, parseAccessLog, parseForkLog, taskDirOf } from "./linkAccesses";

// Monitor logs recorded by the I/O monitor during real runs of Demo 1 and
// Demo 3 on Docker Desktop (WSL 2), with the run's folder renamed to
// /srv/nwave/results and the padding of their columns removed (see
// fixtures/README.md).
const FIXTURES = path.join(__dirname, "fixtures");
const load = (run: string) => {
  const dir = path.join(FIXTURES, run);
  const gz = (name: string) => gunzipSync(fs.readFileSync(path.join(dir, name))).toString("utf8");
  return {
    accesses: parseAccessLog(gz("file-bpf.csv.gz")),
    forks: parseForkLog(gz("cgroups.csv.gz")),
    tasks: JSON.parse(fs.readFileSync(path.join(dir, "tasks.json"), "utf8")).tasks as Array<{ hash: string; name: string; process: string }>,
    trace: JSON.parse(fs.readFileSync(path.join(dir, "trace.json"), "utf8")).tasks as Array<{ hash: string; wchar: number }>,
  };
};
const DEMO_1 = "Demo_1_-_Text_basics_0";
/** The run's folder as the monitor recorded it (renamed as in fixtures/README.md). */
const DEMO_1_FOLDER = "/srv/nwave/results/Demo_1_-_Text_basics_1";
const DEMO_3 = "Demo_3_-_nf-core_rnaseq_rebuilt_from_nodes_0";

describe("linking file accesses to steps", () => {
  it("reads their logs: seconds in file-bpf.csv, microseconds in cgroups.csv", () => {
    const [access] = parseAccessLog(
      "time_start,time_end,pid,utime_start,utime_end,stime_start,stime_end,inode,type,result,handle,offset,size,flags,path\n" +
        "71.375,71.376,16040,2687.476,2687.476,2687.476,2687.476,567,O,0,203,0,0,0x00008000,/srv/a,b/work/58/618e11d8bdd358338d6f9d4183ca2d/.command.sh:/srv:\n",
    );
    expect(access).toMatchObject({ time: 71.375, pid: 16040, inode: 567, type: "O", flags: 0x8000 });
    expect(access?.path).toBe("/srv/a,b/work/58/618e11d8bdd358338d6f9d4183ca2d/.command.sh");
    const [fork] = parseForkLog("56514162.353,15649,15650,20629\n");
    expect(fork).toMatchObject({ ppid: 15649, pid: 15650, cgroup: "20629" });
    expect(fork?.time).toBeCloseTo(56.514162, 5);
    expect(taskDirOf("/x/work/58/618e11d8bdd358338d6f9d4183ca2d/out/a.txt")).toEqual({
      dir: "58/618e11d8bdd358338d6f9d4183ca2d",
      rest: "out/a.txt",
    });
  });

  it("recognises paths the monitor ran together from two opens", () => {
    const run = "/srv/nwave/results/run_1";
    expect(isSplicedPath("results/a.bam/srv/nwave/results/run_1/results/b", run)).toBe(true);
    expect(isSplicedPath("nextflow/work/af/4b56/.command.out/data/desktop-containerd/daemon/x", run)).toBe(true);
    expect(isSplicedPath("nextflow/work/af/4b56/.command.trace/lib/x", run)).toBe(true);
    expect(isSplicedPath("nextflow/work/af/4b56/RAP1/quant.sf", run)).toBe(false);
    expect(isSplicedPath("nextflow/work/af/4b56/.command.trace", run)).toBe(false);
  });

  it("knows a process's cgroup from its own forks, over what it inherited, and across reused pids", () => {
    const index = new CgroupIndex([
      // pid 10 is forked from a process in cgroup 1, then moved: its own forks say 7.
      { time: 1, ppid: 2, pid: 10, cgroup: "1" },
      { time: 2, ppid: 10, pid: 11, cgroup: "7" },
      // pid 10 is reused later, in cgroup 9.
      { time: 50, ppid: 3, pid: 10, cgroup: "9" },
    ]);
    expect(index.at(10, 1.5)).toBe("7");
    expect(index.at(11, 3)).toBe("7");
    expect(index.at(10, 60)).toBe("9");
    expect(index.at(99, 3)).toBeUndefined();
  });

  it("links every task of Demo 1, and counts what it can't link", () => {
    const { accesses, forks, tasks } = load(DEMO_1);
    const result = linkAccesses(accesses, forks, tasks, DEMO_1_FOLDER);
    expect(result.tasks.map((task) => task.process).sort()).toEqual(["DISPLAY_OUTPUT", "FILTER", "FILTER_2", "MAP", "MERGE"]);
    // One task per container: no two tasks share a cgroup.
    expect(new Set(result.tasks.map((task) => task.cgroup)).size).toBe(5);
    expect(result.unlinked.tasksWithoutStart).toEqual([]);
    const linked = result.tasks.reduce((sum, task) => sum + task.files.length, 0);
    expect(linked).toBeGreaterThan(0);
    const { outsideTasks, unknownProcess, unknownFile } = result.unlinked;
    expect(outsideTasks + unknownProcess + unknownFile).toBeGreaterThan(0);
    expect(outsideTasks + unknownProcess + unknownFile).toBeLessThan(result.total);

    // MERGE wrote merged.txt (3081 bytes on disk): all of it recorded.
    const merge = result.tasks.find((task) => task.process === "MERGE");
    const merged = merge?.files.find((file) => file.path.endsWith("/merged.txt"));
    expect(merged).toMatchObject({ bytesWritten: 3081, size: 3081 });
    // Paths are relative to the run's folder; files outside it aren't the run's.
    expect(merged?.path).toBe("nextflow/work/86/91258e441d196075a64b3b2a6d150b/merged.txt");
    for (const task of result.tasks) for (const file of task.files) expect(file.path.startsWith("/")).toBe(false);
  });

  it("links all 42 tasks of Demo 3 to their own cgroups", () => {
    const { accesses, forks, tasks, trace } = load(DEMO_3);
    const result = linkAccesses(accesses, forks, tasks);
    expect(result.tasks).toHaveLength(42);
    expect(new Set(result.tasks.map((task) => task.cgroup)).size).toBe(42);
    // A task never wrote more to files than Nextflow counted it writing in all (wchar).
    for (const task of result.tasks) {
      const written = task.files.reduce((sum, file) => sum + file.bytesWritten, 0);
      const counted = trace.find((entry) => entry.hash === task.hash)?.wchar ?? 0;
      expect(written, task.name).toBeLessThanOrEqual(counted * 1.01 + 4096);
    }
    // UNZIP_GTF wrote genes.gtf: 204286 bytes on disk, all recorded.
    const unzip = result.tasks.find((task) => task.process === "UNZIP_GTF");
    const gtf = unzip?.files.find((file) => file.path.endsWith("/genes.gtf"));
    expect(gtf).toMatchObject({ bytesWritten: 204286, size: 204286 });
  });
});
