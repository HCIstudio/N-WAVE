import { describe, expect, it } from "vitest";
import type { RunTask } from "../../api/runs";
import { layoutGraph, nestedSource, stepRun } from "./nestedGraph";
import type { WorkflowGraph, WorkflowStep } from "./workflowGraph";

const step = (id: string, kind: WorkflowStep["kind"] = "module", include?: string): WorkflowStep => ({
  id,
  kind,
  order: 0,
  ...(include ? { include } : {}),
});

const graph: WorkflowGraph = {
  name: "W",
  steps: [step("A"), step("B"), step("C"), step("D")],
  edges: [
    { source: "input", target: "A" },
    { source: "A", target: "B" },
    { source: "A", target: "C" },
    { source: "B", target: "C" },
    { source: "C", target: "output" },
  ],
  inputs: ["reads"],
  outputs: ["out"],
};

const task = (process: string, status: RunTask["status"] = "succeeded"): RunTask => ({
  hash: process,
  name: process,
  process,
  status,
});

describe("nested graph", () => {
  it("lays steps out left to right by how data flows, in call order down a column", () => {
    const columns = Object.fromEntries(layoutGraph(graph).map((node) => [node.id, node.position]));
    expect(columns.input.x).toBe(0);
    expect(columns.A.x).toBeGreaterThan(columns.input.x);
    expect(columns.B.x).toBeGreaterThan(columns.A.x);
    expect(columns.C.x).toBeGreaterThan(columns.B.x);
    expect(columns.output.x).toBeGreaterThan(columns.C.x);
    // Unconnected: next to the inputs, below A.
    expect(columns.D).toEqual({ x: columns.A.x, y: columns.A.y + 92 });
  });

  it("finds each step's tasks by the workflows they ran in", () => {
    const tasks = [
      task("NFCORE_RNASEQ:RNASEQ:ALIGN_STAR:STAR_ALIGN"),
      task("NFCORE_RNASEQ:RNASEQ:ALIGN_STAR:SAMTOOLS_SORT", "running"),
      task("NFCORE_RNASEQ:RNASEQ:SAMTOOLS_INDEX"),
      task("NFCORE_RNASEQ:PREPARE_GENOME_REFERENCES:GUNZIP_FASTA"),
    ];
    const path = ["NFCORE_RNASEQ", "RNASEQ"];
    expect(stepRun(tasks, path, step("ALIGN_STAR", "subworkflow"))).toMatchObject({
      status: "running",
      total: 2,
      done: 1,
      running: 1,
    });
    expect(stepRun(tasks, path, step("SAMTOOLS_INDEX"))).toMatchObject({ status: "succeeded", total: 1 });
    expect(stepRun(tasks, path, step("QUANTIFY_RSEM", "subworkflow"))).toBeNull();
    // A canvas subworkflow node: its tasks are named alias:process.
    expect(stepRun([task("QUANT:SALMON_QUANT", "failed")], ["QUANT"], step("SALMON_QUANT"))).toMatchObject({
      status: "failed",
      failed: 1,
    });
  });

  it("finds a nested step's file in the pipeline or in nf-core/modules", () => {
    const pipeline = { type: "pipeline", name: "rnaseq", version: "3.27.0", path: "main.nf" } as const;
    expect(nestedSource(pipeline, step("RNASEQ", "workflow", "./workflows/rnaseq"))).toEqual({
      ...pipeline,
      path: "workflows/rnaseq/main.nf",
    });
    expect(
      nestedSource(
        { ...pipeline, path: "workflows/rnaseq/main.nf" },
        step("BAM_STRINGTIE_MERGE", "subworkflow", "../../subworkflows/nf-core/bam_stringtie_merge/main"),
      ),
    ).toEqual({ ...pipeline, path: "subworkflows/nf-core/bam_stringtie_merge/main.nf" });
    expect(
      nestedSource(
        { type: "nfcore", id: "nf-core/subworkflows/quantify_pseudo_alignment" },
        step("QUANT_TXIMPORT_SUMMARIZEDEXPERIMENT", "subworkflow", "../quant_tximport_summarizedexperiment"),
      ),
    ).toEqual({ type: "nfcore", id: "nf-core/subworkflows/quant_tximport_summarizedexperiment" });
    expect(
      nestedSource(
        { type: "nfcore", id: "nf-core/subworkflows/bam_sort_stats_samtools" },
        step("BAM_STATS_SAMTOOLS", "subworkflow", "../bam_stats_samtools/main"),
      ),
    ).toEqual({ type: "nfcore", id: "nf-core/subworkflows/bam_stats_samtools" });
    expect(nestedSource(pipeline, step("SALMON_QUANT", "module", "../modules/x"))).toBeNull();
  });
});
