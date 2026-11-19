import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { MONITOR_FILES, monitorDir, writeMonitorSummary } from "./ioMonitor";
import { readRunAccesses } from "./runAccesses";

// A run's folder with the monitor's logs of the recorded Demo 1 run (fixtures/).
const RUN = "Demo_1_-_Text_basics_0";
const fixture = (name: string) => path.join(__dirname, "fixtures", RUN, name);

describe("a run's accesses by task", () => {
  let runDir: string;
  afterEach(() => fs.rmSync(runDir, { recursive: true, force: true }));

  const makeRun = () => {
    runDir = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-accesses-"));
    const out = path.join(runDir, monitorDir("r1"));
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, MONITOR_FILES.accesses), gunzipSync(fs.readFileSync(fixture("file-bpf.csv.gz"))));
    fs.writeFileSync(path.join(out, MONITOR_FILES.processes), gunzipSync(fs.readFileSync(fixture("cgroups.csv.gz"))));
    fs.writeFileSync(path.join(out, MONITOR_FILES.log), "prefix: /srv/nwave/results/Demo_1_-_Text_basics_1 (depth 12)\n");
    // Nextflow's log, as N-WAVE reads the run's tasks from it.
    const tasks = JSON.parse(fs.readFileSync(fixture("tasks.json"), "utf8")).tasks as Array<{ hash: string; name: string }>;
    fs.mkdirSync(path.join(runDir, "nextflow"));
    fs.writeFileSync(
      path.join(runDir, "nextflow", ".nextflow.log"),
      tasks.map((task) => `Jan-01 00:00:00.000 [Task submitter] INFO  nextflow.Session - [${task.hash}] Submitted process > ${task.name}`).join("\n"),
    );
    return out;
  };

  it("is off for a run without the monitor, and says why it didn't record", () => {
    const out = makeRun();
    expect(readRunAccesses(runDir, "r1")).toEqual({ status: "off" });
    writeMonitorSummary(out, { status: "unavailable", reason: "no kernel headers" });
    expect(readRunAccesses(runDir, "r1")).toEqual({ status: "unavailable", reason: "no kernel headers" });
  });

  it("links the recorded run's accesses to its tasks, with paths in the run's folder, and keeps the result", () => {
    const out = makeRun();
    writeMonitorSummary(out, { status: "recorded" });
    const accesses = readRunAccesses(runDir, "r1");
    if (accesses.status !== "recorded") throw new Error(accesses.status);
    expect(accesses.tasks).toHaveLength(5);
    const merge = accesses.tasks.find((task) => task.name === "MERGE");
    expect(merge?.files.find((file) => file.path === "nextflow/work/86/91258e441d196075a64b3b2a6d150b/merged.txt")).toMatchObject({
      bytesWritten: 3081,
    });
    expect(fs.existsSync(path.join(out, "linked.json"))).toBe(true);
    // Kept: read again without the logs.
    fs.rmSync(path.join(out, MONITOR_FILES.accesses));
    expect(readRunAccesses(runDir, "r1")).toMatchObject({ status: "recorded", total: accesses.total });
  });

  it("passes on the check of the work folders made when the monitor stopped", () => {
    const out = makeRun();
    const folders = [{ folder: "86/91258e441d196075a64b3b2a6d150b", files: 9, missed: 4, missedFiles: [".command.begin"] }];
    writeMonitorSummary(out, { status: "recorded", workFolders: { files: 9, missed: 4, folders } });
    expect(readRunAccesses(runDir, "r1")).toMatchObject({ status: "recorded", workFolders: folders });
    // Also when the linking was kept from before.
    expect(readRunAccesses(runDir, "r1")).toMatchObject({ status: "recorded", workFolders: folders });
  });
});
