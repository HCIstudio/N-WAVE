import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { LinkedTask, RunAccesses, TaskFile } from "../api/runs";
import { accessesByNode, describeUnlinked } from "./ioAccesses";

const file = (path: string, bytesRead: number, bytesWritten: number): TaskFile => ({
  path,
  inode: 1,
  bytesRead,
  bytesWritten,
  reads: 1,
  writes: 1,
  size: Math.max(bytesRead, bytesWritten),
  firstAccess: 0,
  lastAccess: 1,
  firstRead: null,
  lastRead: null,
  firstWrite: null,
  lastWrite: null,
  deleted: false,
  samples: [],
});
const task = (process: string, hash: string, files: TaskFile[]): LinkedTask => ({
  hash,
  name: `${process} (${hash})`,
  process,
  cgroup: hash,
  pids: 3,
  start: 0,
  end: 10,
  files,
});

// Nodes and the process names N-WAVE generates for them (as in nodeRuns.test.ts).
const nodes = [
  { id: "trim", type: "filter", position: { x: 0, y: 0 }, data: {} },
  { id: "align", type: "operator", position: { x: 0, y: 0 }, data: { operatorType: "merge" } },
] as Node[];
const TRIM = "filter_trim";
const ALIGN = "merge_align";

describe("the I/O monitor's records by node", () => {
  const accesses: RunAccesses = {
    status: "recorded",
    tasks: [
      task(TRIM, "aa/111111", [file("work/aa/x/r1.fq", 100, 0), file("work/aa/x/r1.trim.fq", 0, 80)]),
      task(TRIM, "bb/222222", [file("work/bb/y/r2.fq", 50, 0), file("work/bb/y/r2.trim.fq", 0, 40)]),
      task(ALIGN, "cc/333333", [file("work/aa/x/r1.trim.fq", 80, 0)]),
      task("ELSEWHERE", "dd/444444", [file("work/dd/z/a", 1, 1)]),
    ],
    unlinked: { outsideTasks: 10, unknownProcess: 0, unknownFile: 2, tasksWithoutStart: ["MERGE"] },
    total: 100,
  };

  it("sums up each node's tasks: their files and bytes", () => {
    const byNode = accessesByNode(accesses, nodes);
    expect(Object.keys(byNode).sort()).toEqual(["align", "trim"]);
    expect(byNode.trim).toMatchObject({ bytesRead: 150, bytesWritten: 120, files: 4 });
    expect(byNode.trim?.tasks).toHaveLength(2);
    expect(byNode.align).toMatchObject({ bytesRead: 80, bytesWritten: 0, files: 1 });
    expect(accessesByNode({ status: "off" }, nodes)).toEqual({});
  });

  it("says how much is linked, and why the rest isn't", () => {
    expect(describeUnlinked(accesses)).toBe(
      "88 of 100 recorded accesses are linked to steps; not linked: 10 by processes outside the steps' containers (Nextflow, Docker), 2 to files whose opening the monitor didn't record. 1 task couldn't be linked (without a container of its own, or the monitor missed its files): MERGE.",
    );
    expect(describeUnlinked({ status: "unavailable", reason: "x" })).toBeNull();
  });
});
