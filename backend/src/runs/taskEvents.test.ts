import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findTaskWorkDir,
  listTaskOutputs,
  parseTaskEvents,
  readRunTasks,
} from "./taskEvents";

// Lines as Nextflow 25.04 writes them to .nextflow.log.
const LOG = [
  "Oct-15 15:28:58.036 [Task submitter] INFO  nextflow.Session - [b7/8cc335] Submitted process > short_one (1)",
  "Oct-15 15:28:58.062 [Task submitter] INFO  nextflow.Session - [42/c329a5] Submitted process > SUBWF_ALIAS:NF_CORE_SAMTOOLS_SORT (WT_REP1)",
  "Oct-15 15:28:58.067 [Task monitor] DEBUG n.processor.TaskPollingMonitor - Task completed > TaskHandler[id: 2; name: short_one (1); status: COMPLETED; exit: 1; error: -; workDir: /run/desktop/mnt/host/c/Users/me/N-WAVE/results/run/nextflow/work/b7/8cc33522500769af0bbfe147fd26e1]",
  "Oct-15 15:28:58.078 [Task submitter] INFO  nextflow.Session - [1f/9a15a4] Submitted process > filter_demo_filter_barry (1)",
  "Oct-15 15:28:59.100 [Task monitor] DEBUG n.processor.TaskPollingMonitor - Task completed > TaskHandler[id: 3; name: filter_demo_filter_barry (1); status: COMPLETED; exit: 0; error: -; workDir: /app/results/run/nextflow/work/1f/9a15a4aa]",
  "Oct-15 15:29:00.000 [Task submitter] INFO  nextflow.Session - [aa/bbccdd] Cached process > merge_demo_merge (1)",
].join("\n");

describe("parseTaskEvents", () => {
  it("follows each task from submission to its outcome", () => {
    expect(parseTaskEvents(LOG)).toEqual([
      { hash: "b7/8cc335", name: "short_one (1)", process: "short_one", status: "failed", exitCode: 1 },
      {
        hash: "42/c329a5",
        name: "SUBWF_ALIAS:NF_CORE_SAMTOOLS_SORT (WT_REP1)",
        process: "SUBWF_ALIAS:NF_CORE_SAMTOOLS_SORT",
        status: "running",
      },
      {
        hash: "1f/9a15a4",
        name: "filter_demo_filter_barry (1)",
        process: "filter_demo_filter_barry",
        status: "succeeded",
        exitCode: 0,
      },
      { hash: "aa/bbccdd", name: "merge_demo_merge (1)", process: "merge_demo_merge", status: "cached" },
    ]);
  });

  it("returns nothing for a log without tasks", () => {
    expect(parseTaskEvents("N E X T F L O W\n")).toEqual([]);
  });
});

describe("task work directories", () => {
  let runDir: string;
  afterEach(() => fs.rmSync(runDir, { recursive: true, force: true }));

  it("finds a task's outputs, without Nextflow files and staged inputs", () => {
    runDir = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-task-"));
    const workDir = path.join(runDir, "nextflow/work/1f/9a15a4aa0000");
    fs.mkdirSync(path.join(workDir, "sub"), { recursive: true });
    fs.writeFileSync(path.join(workDir, "out.txt"), "Barry");
    fs.writeFileSync(path.join(workDir, "sub/report.html"), "<p/>");
    fs.writeFileSync(path.join(workDir, ".command.sh"), "grep");
    fs.writeFileSync(path.join(runDir, "input.txt"), "in");
    fs.symlinkSync(path.join(runDir, "input.txt"), path.join(workDir, "input.txt"));
    fs.writeFileSync(path.join(runDir, "nextflow/.nextflow.log"), LOG);

    expect(findTaskWorkDir(runDir, "1f/9a15a4")).toBe(workDir);
    expect(findTaskWorkDir(runDir, "1f/000000")).toBeNull();
    expect(findTaskWorkDir(runDir, "../etc")).toBeNull();
    expect(listTaskOutputs(workDir)).toEqual([
      { path: "out.txt", size: 5 },
      { path: "sub/report.html", size: 4 },
    ]);
    expect(readRunTasks(runDir)).toHaveLength(4);
  });
});
