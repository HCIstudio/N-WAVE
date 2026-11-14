import { describe, expect, it } from "vitest";
import type { LinkedTask, RunAccesses, TaskFile } from "../api/runs";
import { accessPattern, describePattern, fileName, followFile, handedOn } from "./ioViews";

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
});
