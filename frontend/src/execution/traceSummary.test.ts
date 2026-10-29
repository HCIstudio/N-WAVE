import { describe, expect, it } from "vitest";
import type { TraceTask } from "../api/runs";
import { summarizeTrace } from "./traceSummary";

const GB = 1024 ** 3;
const task = (process: string, extra: Partial<TraceTask> = {}): TraceTask => ({
  hash: `${process}-${Math.random()}`,
  name: `${process} (1)`,
  process,
  status: "COMPLETED",
  exit: 0,
  attempt: 1,
  submit: 0,
  start: 1_000,
  complete: 61_000,
  duration: 61_000,
  realtime: 60_000,
  cpu: 100,
  peakRss: 1 * GB,
  cpus: 1,
  memory: 4 * GB,
  ...extra,
});

describe("summarizeTrace", () => {
  it("sums up the run and its steps, slowest first", () => {
    const summary = summarizeTrace([
      task("RNASEQ:FASTQC", { start: 1_000, complete: 61_000 }),
      task("RNASEQ:FASTQC", { start: 2_000, complete: 92_000, realtime: 90_000 }),
      task("RNASEQ:STAR_ALIGN", {
        start: 100_000,
        complete: 700_000,
        realtime: 600_000,
        cpu: 400,
        peakRss: 7.6 * GB,
        memory: 8 * GB,
      }),
    ]);
    expect(summary).toMatchObject({ wallTime: 699_000, tasks: 3, cached: 0, failed: 0, retried: 0 });
    expect(summary.cpuHours).toBeCloseTo((60_000 + 90_000 + 600_000 * 4) / 3_600_000);
    expect(summary.processes.map((entry) => [entry.label, entry.tasks, entry.totalRealtime, entry.longestRealtime])).toEqual([
      ["STAR_ALIGN", 1, 600_000, 600_000],
      ["FASTQC", 2, 150_000, 90_000],
    ]);
    expect(summary.processes[0]).toMatchObject({ peakRss: 7.6 * GB, memory: 8 * GB, start: 100_000, end: 700_000 });
    expect(summary.processes[0].memoryShare).toBeCloseTo(0.95);
  });

  it("counts cached, retried, failed and ignored tasks, without cached times", () => {
    const ignored = task("MAG:MAXBIN2", { status: "FAILED", exit: 255, hash: "85/280734" });
    const summary = summarizeTrace(
      [
        task("A", { status: "CACHED", start: 0, complete: 999_999, realtime: 999_999 }),
        task("A", { attempt: 2 }),
        task("B", { status: "FAILED", exit: 137 }),
        ignored,
      ],
      new Set(["85/280734"]),
    );
    expect(summary).toMatchObject({ cached: 1, retried: 1, failed: 1, ignored: 1, tasks: 4 });
    const a = summary.processes.find((entry) => entry.process === "A");
    expect(a).toMatchObject({ tasks: 2, cached: 1, totalRealtime: 60_000, start: 1_000, end: 61_000 });
  });

  it("names steps that share a name by their last two parts", () => {
    const summary = summarizeTrace([task("X:ALIGN:SORT"), task("X:QUANT:SORT"), task("X:FASTQC")]);
    expect(summary.processes.map((entry) => entry.label).sort()).toEqual(["ALIGN:SORT", "FASTQC", "QUANT:SORT"]);
  });

  it("copes with a trace without times or memory", () => {
    const summary = summarizeTrace([task("A", { start: null, complete: null, realtime: null, peakRss: null, memory: null })]);
    expect(summary).toMatchObject({ wallTime: 0, start: null, end: null });
    expect(summary.processes[0].memoryShare).toBeNull();
  });
});
