import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TraceTask } from "../../../api/runs";
import type { NodeRunSummary } from "../../../execution/nodeRuns";

const getRunTrace = vi.fn();
vi.mock("../../../api/runs", () => ({
  getRunTrace: (...args: unknown[]) => getRunTrace(...args),
}));

const { default: NodeTraceLine, describeNodeTrace } = await import("./NodeTraceLine");

const GB = 1024 ** 3;
const traced = (hash: string, extra: Partial<TraceTask> = {}): TraceTask => ({
  hash,
  name: `STAR (${hash})`,
  process: "RNASEQ:STAR",
  status: "COMPLETED",
  exit: 0,
  attempt: 1,
  submit: 0,
  start: 0,
  complete: 48_000,
  duration: 48_000,
  realtime: 48_000,
  cpu: 100,
  peakRss: 6.1 * GB,
  cpus: 4,
  memory: 8 * GB,
  rchar: 0.575 * GB,
  wchar: 0.275 * GB,
  readBytes: 0,
  writeBytes: 0,
  ...extra,
});

describe("NodeTraceLine", () => {
  it("sums up a step's tasks in one line", () => {
    const tasks = ["a", "b", "c", "d"].map((hash) => traced(hash));
    expect(describeNodeTrace(tasks)).toBe("4 tasks, 3 min, peak 6.1 GB, read 2.3 GB, wrote 1.1 GB");
    expect(describeNodeTrace([])).toBeNull();
    expect(describeNodeTrace([traced("a", { status: "CACHED" })])).toBe("1 task (1 cached), peak 6.1 GB");
    // A trace from before v1.7 has no bytes.
    expect(describeNodeTrace([traced("a", { rchar: null, wchar: null, readBytes: null, writeBytes: null, realtime: 300 })])).toBe(
      "1 task, < 1 s, peak 6.1 GB",
    );
  });

  it("shows only the node's own tasks of the run's trace", async () => {
    getRunTrace.mockResolvedValue([traced("aa/111111"), traced("bb/222222", { process: "OTHER", rchar: 99 * GB })]);
    const summary = {
      status: "succeeded",
      total: 1,
      done: 1,
      failed: 0,
      ignored: 0,
      running: 0,
      cached: 0,
      tasks: [{ hash: "aa/111111", name: "STAR (a)", process: "RNASEQ:STAR", status: "succeeded" }],
    } satisfies NodeRunSummary;
    render(<NodeTraceLine runId="r1" summary={summary} />);
    expect((await screen.findByTestId("node-trace-line")).textContent).toBe(
      "1 task, 48 s, peak 6.1 GB, read 588.8 MB, wrote 281.6 MB",
    );
    expect(getRunTrace).toHaveBeenCalledWith("r1");
  });
});
