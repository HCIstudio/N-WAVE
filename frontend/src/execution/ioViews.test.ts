import { describe, expect, it } from "vitest";
import type { LinkedTask, RunAccesses, TaskFile } from "../api/runs";
import {
  accessPattern,
  describePattern,
  describeStepFolders,
  fileName,
  followFile,
  handedOn,
  stepWorkFolders,
} from "./ioViews";

const file = (path: string, extra: Partial<TaskFile> = {}): TaskFile => ({
  path,
  inode: 1,
  bytesRead: 0,
  bytesWritten: 0,
  reads: 0,
  writes: 0,
  size: 0,
  firstAccess: 0,
  lastAccess: 0,
  firstRead: null,
  lastRead: null,
  firstWrite: null,
  lastWrite: null,
  deleted: false,
  samples: [],
  ...extra,
});
const task = (name: string, start: number, files: TaskFile[]): LinkedTask => ({
  hash: name,
  name,
  process: name,
  cgroup: name,
  pids: 1,
  start,
  end: start + 100,
  files,
});

describe("how a step reads and writes its files", () => {
  it("tells bulk from streaming access by the share of the task's time (Witzke et al., Fig. 4)", () => {
    const streamed = file("a", { reads: 400, firstRead: 5, lastRead: 95 });
    expect(accessPattern(streamed, "R", 100)).toEqual({ share: 0.9, kind: "streaming" });
    expect(describePattern(accessPattern(streamed, "R", 100))).toBe("streaming (90 % of the time)");
    expect(accessPattern(file("b", { reads: 30, firstRead: 0, lastRead: 3 }), "R", 100).kind).toBe("bulk");
    expect(accessPattern(file("c", { writes: 9, firstWrite: 10, lastWrite: 50 }), "W", 100).kind).toBe("in parts");
    expect(describePattern(accessPattern(file("d", { reads: 1, firstRead: 4, lastRead: 4 }), "R", 100))).toBe("at once");
    expect(fileName("nextflow/work/ab/cd/out.bam")).toBe("out.bam");
  });

  it("follows a file from the step that wrote it to the one that read it (Fig. 5)", () => {
    const accesses: Extract<RunAccesses, { status: "recorded" }> = {
      status: "recorded",
      total: 10,
      unlinked: { outsideTasks: 0, unknownProcess: 0, unknownFile: 0, tasksWithoutStart: [] },
      tasks: [
        task("TRIM", 1000, [
          file("w/x/r.trim.fq", { bytesWritten: 200, samples: [[1, 0, 100, "W"], [2, 100, 100, "W"]] }),
        ]),
        task("ALIGN", 1010, [
          file("w/x/r.trim.fq", { bytesRead: 200, samples: [[0.5, 0, 200, "R"]] }),
          file("w/y/out.bam", { bytesWritten: 9 }),
        ]),
      ],
    };
    expect(followFile(accesses, "w/x/r.trim.fq")).toEqual([
      { time: 1001, offset: 0, bytes: 100, type: "W", task: "TRIM" },
      { time: 1002, offset: 100, bytes: 100, type: "W", task: "TRIM" },
      { time: 1010.5, offset: 0, bytes: 200, type: "R", task: "ALIGN" },
    ]);
    expect(handedOn(accesses)).toEqual([{ path: "w/x/r.trim.fq", writer: "TRIM", readers: ["ALIGN"] }]);
  });

  it("says how many of a step's work-folder files the monitor saw, and names a few it missed", () => {
    const folders = [
      { folder: "aa/111111ff", files: 9, missed: 3, missedFiles: [".command.begin", ".command.out", ".command.err"] },
      { folder: "aa/222222ff", files: 9, missed: 2, missedFiles: [".command.begin", "sub/x.txt"] },
      { folder: "bb/333333ff", files: 4, missed: 0, missedFiles: [] },
    ];
    expect(stepWorkFolders(undefined, ["aa/111111"])).toBeNull();
    expect(stepWorkFolders(folders, ["cc/444444"])).toBeNull();
    const step = stepWorkFolders(folders, ["aa/111111", "aa/222222"]);
    expect(step).toEqual({ folders: 2, files: 18, missed: 5, examples: [".command.begin", ".command.out", ".command.err"] });
    expect(describeStepFolders(step as NonNullable<typeof step>)).toBe(
      "The monitor saw 13 of the 18 files in this step's 2 work folders; it missed 5 (.command.begin, .command.out, .command.err, …), so these views lack their accesses.",
    );
    const all = stepWorkFolders(folders, ["bb/333333"]);
    expect(describeStepFolders(all as NonNullable<typeof all>)).toBe("The monitor saw all 4 files in this step's work folder.");
  });
});
