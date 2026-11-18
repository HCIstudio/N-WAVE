import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import demo1 from "../../demo/recordedRuns/demo-1.json";
import demo3 from "../../demo/recordedRuns/demo-3.json";
import { demoWorkflowSeed } from "../../demo/demoWorkflow";
import rnaseq from "../../demo/rnaseqStarSalmonExample.json";
import { nodeIdForProcess } from "../../execution/nodeRuns";
import { describeStep, runInsight } from "./runInsight";
import { buildRunModel, measuredRuntime, predictRun } from "./runModel";

// The demo's recorded runs of Demo 1 and Demo 3 (4 CPUs, 4 GB), on their canvases.
const insightOf = (recording: { trace: unknown[] }, nodes: Node[], edges: Edge[]) => {
  const model = buildRunModel({
    trace: recording.trace as Parameters<typeof buildRunModel>[0]["trace"],
    nodeOf: (process) => nodeIdForProcess(process, nodes),
    edges,
    labelOf: (id) => String(nodes.find((node) => node.id === id)?.data.label ?? id),
  });
  return runInsight(model, predictRun(model, { cpus: 4, memory: 4 * 1024 ** 3 }), measuredRuntime(model));
};

describe("what limited a run", () => {
  it("Demo 3: STAR alignment waited for the STAR index, then for its tasks; the chain runs through it to MultiQC", () => {
    const insight = insightOf(demo3, rnaseq.nodes as Node[], rnaseq.edges as Edge[]);
    expect(insight.chain).toEqual(["gunzip_gtf", "gtf_filter", "star_index", "star_align", "bam_sort_stats", "multiqc"]);
    const star = insight.steps.find((step) => step.id === "star_align");
    expect(star?.sentence).toMatch(/^STAR alignment: limited by waiting for STAR index for \d+ %, then its tasks' running time for \d+ %\.$/);
    expect(insight.steps.find((step) => step.id === "multiqc")?.sentence).toMatch(/^MultiQC: limited by waiting for SAMtools sort, index, stats/);
    expect(Math.abs(insight.error)).toBeLessThan(0.1);
  });

  it("Demo 1: each step waits for the one before, along the chain Filter → Map → Merge → Display Output", () => {
    const insight = insightOf(demo1, demoWorkflowSeed.nodes as Node[], demoWorkflowSeed.edges as Edge[]);
    expect(insight.chain).toEqual(["demo-filter-barry", "demo-map-uppercase", "demo-merge", "demo-output"]);
    expect(insight.steps.find((step) => step.id === "demo-merge")?.sentence).toMatch(/^Merge: limited by waiting for Map/);
    // Memory doesn't hold back a step with one task (2 GB of 4 GB).
    expect(insight.steps.some((step) => step.sentence.includes("memory"))).toBe(false);
  });

  it("says what limited a step, in the order it did, leaving out what limited it less than 5 % of the time", () => {
    const label = (id: string) => ({ idx: "STAR index" })[id] ?? id;
    expect(
      describeStep(
        "STAR",
        [
          { from: 0, to: 20, limit: { kind: "input", from: "idx" } },
          { from: 20, to: 98, limit: { kind: "cpu" } },
          { from: 98, to: 100, limit: { kind: "slots" } },
        ],
        label,
      ),
    ).toBe("STAR: limited by waiting for STAR index for 20 %, then CPU for 78 %.");
    expect(describeStep("X", [], label)).toBe("X: too short to tell.");
  });
});
