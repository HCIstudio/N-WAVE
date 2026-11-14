import type { Edge, Node } from "@xyflow/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import demo3 from "../../../demo/recordedRuns/demo-3.json";
import rnaseq from "../../../demo/rnaseqStarSalmonExample.json";
import type { RunProfile } from "../../../execution/runProfiles";
import { nodeIdForProcess } from "../../../execution/nodeRuns";
import { buildRunModel, measuredRuntime, predictRun } from "../../../insight/bottlemod/runModel";
import WhatIf, { distanceFromMeasured, predictWhatIf, profileResources } from "./WhatIf";
import trace4 from "../../../insight/bottlemod/fixtures/demo3-trace-4cpus.json";
import trace2 from "../../../insight/bottlemod/fixtures/demo3-trace-2cpus.json";

const nodes = rnaseq.nodes as Node[];
const model = buildRunModel({
  trace: demo3.trace as Parameters<typeof buildRunModel>[0]["trace"],
  nodeOf: (process) => nodeIdForProcess(process, nodes),
  edges: rnaseq.edges as Edge[],
  labelOf: (id) => String(nodes.find((node) => node.id === id)?.data.label ?? id),
});
const measured = { cpus: 4, memory: 4 * 1024 ** 3 };

describe("what if", () => {
  it("predicts Demo 3 faster with more CPUs and slower with fewer, and says when it is less certain", () => {
    const at = (cpus: number) => predictWhatIf(model, measured, { cpus, memoryGb: 4, priority: null });
    const two = at(2);
    const four = at(4);
    const eight = at(8);
    expect(four.predicted).toBeCloseTo(predictRun(model, measured).total, 6);
    expect(two.predicted as number).toBeGreaterThan(four.predicted as number);
    expect(eight.predicted as number).toBeLessThanOrEqual(four.predicted as number);
    expect(four.lessCertain).toBe(false);
    expect(at(16).lessCertain).toBe(true);
    expect(distanceFromMeasured({ cpus: 1, memoryGb: 4, priority: null }, measured)).toBe(4);
    expect(four.chain[four.chain.length - 1]).toBe("MultiQC");
  });

  it("caps each step's CPUs as Maximum CPU Cores does: Demo 3's steps ask for one, so a cap of 2 changes nothing", () => {
    const capped = predictRun(model, { ...measured, cpusPerTask: 2 }).total;
    expect(capped).toBeCloseTo(predictRun(model, measured).total, 6);
    // A real run of Demo 3 with Maximum CPU Cores at 2, on the same 4 CPUs, took 212.4 s.
    expect(Math.abs(capped / 212.4 - 1)).toBeLessThan(0.05);
  });

  it("fits the runs it came from, and overrates what CPUs change (Demo 3, without the I/O monitor)", () => {
    // Real runs of Demo 3's exported workflow, Nextflow's local executor limited to 4 and to
    // 2 CPUs in all (fixtures/): 185.7 s and 243.9 s.
    const modelOfRun = (trace: unknown) =>
      buildRunModel({
        trace: trace as Parameters<typeof buildRunModel>[0]["trace"],
        nodeOf: (process) => nodeIdForProcess(process, nodes),
        edges: rnaseq.edges as Edge[],
        labelOf: (id) => id,
      });
    const four = modelOfRun(trace4);
    const two = modelOfRun(trace2);
    expect(measuredRuntime(four)).toBeCloseTo(185.7, 0);
    expect(measuredRuntime(two)).toBeCloseTo(243.9, 0);
    const at = (model: typeof four, cpus: number) => predictRun(model, { cpus, memory: 4 * 1024 ** 3 }).total;
    // Each fits its own run within 10 %.
    expect(Math.abs(at(four, 4) / 185.7 - 1)).toBeLessThan(0.1);
    expect(Math.abs(at(two, 2) / 243.9 - 1)).toBeLessThan(0.1);
    // Across the two, it is about a third off, in the direction of more effect (what the wiki says).
    expect(at(four, 2) / 243.9 - 1).toBeGreaterThan(0.2);
    expect(at(two, 4) / 185.7 - 1).toBeLessThan(-0.2);
  });

  it("gives a step the CPUs first when asked", () => {
    const first = predictRun(model, { cpus: 2, memory: 4 * 1024 ** 3 }, { priority: "star_align" });
    const plain = predictRun(model, { cpus: 2, memory: 4 * 1024 ** 3 });
    const star = (prediction: typeof plain) => prediction.steps.find((step) => step.id === "star_align")?.end ?? 0;
    expect(star(first)).toBeLessThanOrEqual(star(plain));
  });

  it("reads what a cluster profile gives: its queue of jobs, each with its CPUs and memory", () => {
    expect(profileResources({ name: "slurm", executor: "slurm", containerEngine: "singularity", cpus: 4, memory: "8 GB", queueSize: 10 } as RunProfile)).toEqual({
      cpus: 40,
      memoryGb: 80,
    });
    expect(profileResources({ name: "here", executor: "local", containerEngine: "docker" } as RunProfile)).toBeNull();
  });

  it("updates the prediction as the CPUs change", () => {
    render(<WhatIf model={model} resources={measured} measured={measuredRuntime(model)} />);
    const result = screen.getByTestId("what-if-result");
    const before = result.textContent;
    expect(before).toContain("Predicted 3 min 30 s");
    fireEvent.change(screen.getByRole("slider", { name: /computer/ }), { target: { value: "2" } });
    expect(result.textContent).not.toBe(before);
    expect(result.textContent).toMatch(/% slower than the 3 min 39 s measured/);
    // Measured on Demo 3: the model overrates what CPUs change, and says so.
    expect(result.textContent).toContain("The model overrates what CPUs change");
    fireEvent.change(screen.getByRole("slider", { name: /computer/ }), { target: { value: "16" } });
    expect(result.textContent).toContain("Less certain");
  });
});
