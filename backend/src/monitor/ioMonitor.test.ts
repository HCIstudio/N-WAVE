import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMonitorDockerArgs,
  checkRecordedWrites,
  describeMonitorSummary,
  finishInterruptedMonitors,
  monitorContainerName,
  monitorDir,
  parseMonitorLine,
  readMonitorPrefix,
  readIoMonitorConfig,
  readMonitorSummary,
  waitForStoppingMonitors,
  writeMonitorSummary,
} from "./ioMonitor";

describe("the I/O monitor", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("reads its settings from the environment", () => {
    // By default the image each release publishes, of N-WAVE's own version.
    const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8")) as { version: string };
    expect(readIoMonitorConfig({})).toEqual({ allowed: true, image: `hcistudio/nwave-iomonitor:${version}`, startTimeoutMs: 180_000 });
    expect(readIoMonitorConfig({ NWAVE_IO_MONITOR: "off", NWAVE_IO_MONITOR_IMAGE: "lab/monitor:1", NWAVE_IO_MONITOR_START_TIMEOUT: "60" })).toEqual({
      allowed: false,
      image: "lab/monitor:1",
      startTimeoutMs: 60_000,
    });
  });

  it("starts privileged, in the host's process namespace, with the run's results", () => {
    const args = buildMonitorDockerArgs({
      image: "nwave-iomonitor:dev",
      containerName: monitorContainerName("Demo 1/run_17"),
      results: { volumesFrom: "nwave-backend" },
      mountPoint: "/app/results",
      runFolder: "Demo_1_17",
      outputFolder: "Demo_1_17/nwave_monitor/Demo_1_17",
    });
    expect(args.slice(0, 4)).toEqual(["run", "-d", "--name", "nwave-iomonitor-Demo_1_run_17"]);
    expect(args).toContain("--privileged");
    expect(args).toContain("--pid=host");
    expect(args.join(" ")).toContain("--volumes-from nwave-backend");
    expect(args.slice(-4)).toEqual(["nwave-iomonitor:dev", "/app/results", "Demo_1_17", "Demo_1_17/nwave_monitor/Demo_1_17"]);
    const bound = buildMonitorDockerArgs({
      image: "i",
      containerName: "c",
      results: { bind: "/srv/results" },
      mountPoint: "/nwave-results",
      runFolder: "r",
      outputFolder: "r/o",
    });
    expect(bound.join(" ")).toContain("--mount type=bind,source=/srv/results,target=/nwave-results");
  });

  it("understands the entrypoint's ready and unavailable lines", () => {
    expect(parseMonitorLine("NWAVE-MONITOR ready 6.18.58.1-microsoft-standard-WSL2")).toEqual({
      ready: true,
      kernel: "6.18.58.1-microsoft-standard-WSL2",
    });
    expect(parseMonitorLine("NWAVE-MONITOR unavailable no kernel headers for 6.1.0 (no package)")).toEqual({
      ready: false,
      reason: "no kernel headers for 6.1.0 (no package)",
    });
    expect(parseMonitorLine("Attaching to all filesystems.")).toBeNull();
  });

  it("finds lost write events: files with fewer recorded bytes than on disk", () => {
    const prefix = "/home/u/results/run_1";
    // Handles stand for the opens; the inode ids don't matter.
    const line = (type: string, handle: number, result: number, flags: string, path = "") =>
      `                  16.073,                  16.074,      27785,2687.476,2687.476,2687.476,2687.476,1,${type},${result},${handle},0,${result},${flags},${path}`;
    const log = [
      "time_start,time_end,pid,utime_start,utime_end,stime_start,stime_end,inode,type,result,handle,offset,size,flags,path",
      line("O", 1, 0, "0x00008241", `${prefix}/work/ab/cdef/out.txt:${prefix}/work:`),
      line("W", 1, 600, "0x00008241"),
      line("W", 1, 400, "0x00008241"),
      line("O", 2, 0, "0x00008241", `${prefix}/work/ab/cdef/part.bam:/x:`),
      line("W", 2, 100, "0x00008241"),
      // Read-only, outside the run, or copied without write(): not checked.
      line("O", 3, 0, "0x00008000", `${prefix}/work/ab/cdef/in.fq:/x:`),
      line("O", 4, 0, "0x00008241", "/elsewhere/log.txt:/x:"),
      line("W", 4, 50, "0x00008241"),
      line("O", 5, 0, "0x00008241", `${prefix}/results/copied.txt:/x:`),
      // N-WAVE's own summary, rewritten after the monitor stopped.
      line("O", 6, 0, "0x00008241", `${prefix}/nwave_monitor/run_1/monitor.json:/x:`),
      line("W", 6, 10, "0x00008241"),
    ].join("\n");
    const sizes: Record<string, number> = { "work/ab/cdef/out.txt": 1000, "work/ab/cdef/part.bam": 4096, "results/copied.txt": 9 };
    expect(checkRecordedWrites(log, prefix, (relative) => sizes[relative] ?? null)).toEqual({
      files: 2,
      incomplete: 1,
      missingBytes: 3996,
    });
    expect(readMonitorPrefix("compiling\nprefix: /home/u/results/run_1 (depth 13)\nAttaching")).toBe(prefix);
  });

  it("keeps what it did with the run, and says it in the log", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-monitor-"));
    expect(readMonitorSummary(dir, "r1")).toBeNull();
    writeMonitorSummary(path.join(dir, monitorDir("r1")), { status: "recorded", accesses: 1200, processes: 40, incompleteFiles: 0 });
    expect(readMonitorSummary(dir, "r1")).toMatchObject({ status: "recorded", accesses: 1200 });
    expect(describeMonitorSummary({ status: "recorded", accesses: 1200, processes: 40, checkedFiles: 9, incompleteFiles: 0 })).toBe(
      "N-WAVE: the I/O monitor recorded 1200 file accesses and 40 process starts.\n",
    );
    expect(describeMonitorSummary({ status: "recorded", accesses: 5, processes: 1, checkedFiles: 9, incompleteFiles: 2, missingBytes: 512 })).toContain(
      "For 2 of the 9 files the run wrote, it recorded fewer bytes than the files have (512 bytes): events were lost, or recorded for another file.",
    );
    // The files in the steps' work folders it saw no open of.
    const workFolders = { files: 46, missed: 17, folders: [] };
    expect(describeMonitorSummary({ status: "recorded", accesses: 5, processes: 1, workFolders })).toBe(
      "N-WAVE: the I/O monitor recorded 5 file accesses and 1 process starts. Of the 46 files in the steps' work folders, it saw no open of 17: their accesses were lost.\n",
    );
    expect(describeMonitorSummary({ status: "recorded", accesses: 5, processes: 1, workFolders: { ...workFolders, missed: 0 } })).toContain(
      "It saw all 46 files in the steps' work folders.",
    );
  });

  it("finishes, at the next start, a summary left running when N-WAVE stopped during a run", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-monitor-"));
    const runDir = path.join(dir, "run_0");
    const outDir = path.join(runDir, monitorDir("run_0"));
    const prefix = "/srv/nwave/results/run_0";
    const make = (relative: string, content: string) => {
      fs.mkdirSync(path.dirname(path.join(runDir, relative)), { recursive: true });
      fs.writeFileSync(path.join(runDir, relative), content);
    };
    // The monitor ran: its logs, and the summary written when it started.
    writeMonitorSummary(outDir, { status: "running", kernel: "6.18", startedAt: new Date(0).toISOString() });
    fs.writeFileSync(path.join(outDir, "monitor.log"), `prefix: ${prefix} (depth 5)\n`);
    const row = (type: string, handle: number, size: number, file = "") =>
      `1.0,1.1,100,0.1,0.1,0.1,0.1,7,${type},${size},${handle},0,${size},0x00008241,${file ? `${prefix}/${file}:/srv:` : ""}`;
    fs.writeFileSync(
      path.join(outDir, "file-bpf.csv"),
      [
        "time_start,time_end,pid,utime_start,utime_end,stime_start,stime_end,inode,type,result,handle,offset,size,flags,path",
        row("O", 1, 0, "nextflow/work/ab/cdef01/out.txt"),
        row("W", 1, 4),
      ].join("\n"),
    );
    fs.writeFileSync(path.join(outDir, "cgroups.csv"), "1.0,1,2,3\n");
    make("nextflow/work/ab/cdef01/out.txt", "four");
    make("nextflow/work/ab/cdef01/.command.err", "");
    // Another run whose monitor finished as usual, and one without a monitor.
    writeMonitorSummary(path.join(dir, "run_1", monitorDir("run_1")), { status: "recorded", accesses: 3 });
    fs.mkdirSync(path.join(dir, "run_2"));
    const runs = [
      { id: "run_0", dir: runDir },
      { id: "run_1", dir: path.join(dir, "run_1") },
      { id: "run_2", dir: path.join(dir, "run_2") },
    ];

    expect(finishInterruptedMonitors(runs)).toBe(1);
    expect(readMonitorSummary(runDir, "run_0")).toMatchObject({
      status: "recorded",
      reason: "N-WAVE stopped during the run; the monitor recorded until then.",
      kernel: "6.18",
      accesses: 2,
      processes: 1,
      checkedFiles: 1,
      incompleteFiles: 0,
      workFolders: { files: 2, missed: 1 },
    });
    expect(readMonitorSummary(runDir, "run_0")?.stoppedAt).toEqual(expect.any(String));
    expect(readMonitorSummary(path.join(dir, "run_1"), "run_1")).toEqual({ status: "recorded", accesses: 3 });
    // Once finished, it stays as it is.
    expect(finishInterruptedMonitors(runs)).toBe(0);
    // With no monitor stopping, shutting down doesn't wait.
    const t0 = Date.now();
    await waitForStoppingMonitors(5_000);
    expect(Date.now() - t0).toBeLessThan(1_000);
  });
});
