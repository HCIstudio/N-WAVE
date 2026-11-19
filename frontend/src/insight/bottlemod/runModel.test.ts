import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import demo1 from "../../demo/recordedRuns/demo-1.json";
import demo3 from "../../demo/recordedRuns/demo-3.json";
import { demoWorkflowSeed } from "../../demo/demoWorkflow";
import rnaseq from "../../demo/rnaseqStarSalmonExample.json";
import { nodeIdForProcess } from "../../execution/nodeRuns";
import { lastOf } from "./ppoly";
import { buildRunModel, measuredRuntime, orderSteps, peakReservedCpus, predictRun, slotsFor } from "./runModel";

// The demo's recorded runs of Demo 1 and Demo 3 (real runs on an
// installation with 4 CPUs and 4 GB), on their own canvases.
const modelOf = (recording: { trace: unknown[] }, nodes: Node[], edges: Edge[]) =>
  buildRunModel({
    trace: recording.trace as Parameters<typeof buildRunModel>[0]["trace"],
    nodeOf: (process) => nodeIdForProcess(process, nodes),
    edges,
    labelOf: (id) => String(nodes.find((node) => node.id === id)?.data.label ?? id),
  });
const RESOURCES = { cpus: 4, memory: 4 * 1024 ** 3 };

describe("a BottleMod model of a run", () => {
  it("has a step per node that ran, connected as on the canvas through nodes without tasks", () => {
    const steps = modelOf(demo1, demoWorkflowSeed.nodes as Node[], demoWorkflowSeed.edges as Edge[]);
    expect(steps.map((step) => step.label).sort()).toEqual(["Display Output", "Filter", "Filter", "Map", "Merge"].sort());
    const merge = steps.find((step) => step.label === "Merge");
    expect(merge?.inputs.map((input) => steps.find((step) => step.id === input.from)?.label).sort()).toEqual(["Filter", "Map"]);
    // One task each: it needs all of its input first.
    expect(merge?.inputs.every((input) => input.kind === "burst")).toBe(true);
    expect(lastOf(orderSteps(steps)).label).toBe("Display Output");
  });

  it("predicts Demo 1's runtime within 15 % of the measured one", () => {
    const steps = modelOf(demo1, demoWorkflowSeed.nodes as Node[], demoWorkflowSeed.edges as Edge[]);
    const measured = measuredRuntime(steps);
    const { total } = predictRun(steps, RESOURCES);
    expect(measured).toBeCloseTo(19.86, 1);
    expect(Math.abs(total / measured - 1)).toBeLessThan(0.15);
  });

  it("predicts Demo 3's runtime within 25 % of the measured one, in milliseconds", () => {
    const steps = modelOf(demo3, rnaseq.nodes as Node[], rnaseq.edges as Edge[]);
    const measured = measuredRuntime(steps);
    const started = performance.now();
    const { total, steps: predicted } = predictRun(steps, RESOURCES);
    expect(performance.now() - started).toBeLessThan(500);
    expect(Math.abs(total / measured - 1)).toBeLessThan(0.25);
    // STAR alignment needs the most CPU time, and it ends after the steps it waits for.
    const star = steps.find((step) => step.label === "STAR alignment");
    expect([...steps].sort((a, b) => b.cpuSeconds - a.cpuSeconds)[0]?.id).toBe(star?.id);
    const index = predicted.find((step) => step.id === "star_index");
    expect(predicted.find((step) => step.id === star?.id)?.end).toBeGreaterThan(index?.end ?? Infinity);
  });

  it("runs fewer tasks at once with fewer CPUs or less memory", () => {
    const step = { tasks: 4, cpusPerTask: 2, memoryPerTask: 2 * 1024 ** 3 } as Parameters<typeof slotsFor>[0];
    expect(slotsFor(step, { cpus: 8, memory: 64 * 1024 ** 3 })).toBe(4);
    expect(slotsFor(step, { cpus: 4, memory: 64 * 1024 ** 3 })).toBe(2);
    expect(slotsFor(step, { cpus: 8, memory: 4 * 1024 ** 3 })).toBe(2);
    expect(slotsFor(step, { cpus: 1, memory: 1 })).toBe(1);
  });

  it("finds the most CPUs a run's tasks reserved at once, a task ending as another starts not overlapping it", () => {
    const task = (start: number, complete: number, cpus = 1, status = "COMPLETED") => ({ status, start, complete, cpus });
    expect(peakReservedCpus([])).toBe(0);
    expect(peakReservedCpus([task(0, 10), task(10, 20), task(20, 30)])).toBe(1);
    expect(peakReservedCpus([task(0, 10, 2), task(5, 15), task(6, 8, 1, "CACHED")])).toBe(3);
    // The recorded Demo 3 run had Maximum CPU Cores at 4: never more than 4 at once.
    expect(peakReservedCpus(demo3.trace as Parameters<typeof peakReservedCpus>[0])).toBeLessThanOrEqual(4);
  });
});
