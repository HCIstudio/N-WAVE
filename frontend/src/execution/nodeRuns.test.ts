import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { RunTask } from "../api/runs";
import { generateNextflowScript } from "../generators/core/generateNextflowScript";
import { registerDynamicNodeDefinitions } from "../registry/nodeDefinitions";
import { buildRnaseqStarSalmonExample } from "../test/examples/rnaseqStarSalmon";
import { nodeIdForProcess, summarizeNodeRuns } from "./nodeRuns";

const task = (
  process: string,
  status: RunTask["status"],
  hash = `${process.length.toString(16).padStart(2, "0")}/abcdef`,
): RunTask => ({ hash, name: `${process} (1)`, process, status });

describe("summarizeNodeRuns", () => {
  const nodes = [
    { id: "demo-filter-barry", type: "filter", position: { x: 0, y: 0 }, data: {} },
    { id: "demo-merge", type: "operator", position: { x: 0, y: 0 }, data: { operatorType: "merge" } },
    { id: "demo-output", type: "outputDisplay", position: { x: 0, y: 0 }, data: {} },
  ] as Node[];

  it("groups tasks by the node that generated them", () => {
    const runs = summarizeNodeRuns(
      [
        task("filter_demo_filter_barry", "succeeded", "aa/000001"),
        task("merge_demo_merge", "running", "aa/000002"),
        task("merge_demo_merge", "succeeded", "aa/000003"),
        task("outputDisplay_demo_output", "failed", "aa/000004"),
        task("something_else", "running", "aa/000005"),
      ],
      nodes,
    );
    expect(Object.keys(runs).sort()).toEqual(["demo-filter-barry", "demo-merge", "demo-output"]);
    expect(runs["demo-filter-barry"]).toMatchObject({ status: "succeeded", total: 1, done: 1 });
    expect(runs["demo-merge"]).toMatchObject({ status: "running", total: 2, done: 1, running: 1 });
    expect(runs["demo-output"]).toMatchObject({ status: "failed", failed: 1 });
  });

  it("marks a node whose tasks were all reused from the cache", () => {
    const runs = summarizeNodeRuns(
      [
        task("filter_demo_filter_barry", "cached", "aa/000001"),
        task("merge_demo_merge", "cached", "aa/000002"),
        task("merge_demo_merge", "succeeded", "aa/000003"),
      ],
      nodes,
    );
    expect(runs["demo-filter-barry"]).toMatchObject({ status: "cached", done: 1, cached: 1 });
    expect(runs["demo-merge"]).toMatchObject({ status: "succeeded", done: 2, cached: 1 });
  });

    it("gives every task to the pipeline node when a whole pipeline runs", () => {
    const runs = summarizeNodeRuns(
      [task("NFCORE_RNASEQ:RNASEQ:FASTQC", "running")],
      nodes,
      "pipeline-1",
    );
    expect(Object.keys(runs)).toEqual(["pipeline-1"]);
    // One process: no breakdown.
    expect(runs["pipeline-1"].processes).toBeUndefined();
  });

  it("breaks a node that runs several processes down by process", () => {
    const runs = summarizeNodeRuns(
      [
        task("NFCORE_ATACSEQ:ATACSEQ:FASTQC", "succeeded", "aa/000001"),
        task("NFCORE_ATACSEQ:ATACSEQ:FASTQC", "running", "aa/000002"),
        task("NFCORE_ATACSEQ:PREPARE_GENOME:GUNZIP", "succeeded", "aa/000003"),
        task("NFCORE_ATACSEQ:ATACSEQ:MERGE:GUNZIP", "failed", "aa/000004"),
      ],
      nodes,
      "pipeline-1",
    );
    expect(runs["pipeline-1"]).toMatchObject({ total: 4, done: 2, running: 1, failed: 1 });
    expect(
      runs["pipeline-1"].processes?.map(({ label, status, done, total }) => [
        label,
        status,
        done,
        total,
      ]),
    ).toEqual([
      ["FASTQC", "running", 1, 2],
      // Same module in two subworkflows: named with the subworkflow.
      ["PREPARE_GENOME:GUNZIP", "succeeded", 1, 1],
      ["MERGE:GUNZIP", "failed", 0, 1],
    ]);
  });

  it("maps the STAR + Salmon example's nf-core aliases, subworkflow steps included", () => {
    const { nodes: exampleNodes, edges, definitions } = buildRnaseqStarSalmonExample();
    registerDynamicNodeDefinitions(definitions);
    const script = generateNextflowScript(
      exampleNodes as Node[],
      edges as Edge[],
      "RNA-seq",
      "results",
      "{workflow_name}",
    );
    const aliases = [...script.matchAll(/include \{ \S+ as (\S+) \}/g)].map(
      (match) => match[1] ?? "",
    );
    expect(aliases.length).toBeGreaterThan(5);

    // Nextflow names subworkflow tasks "<ALIAS>:<PROCESS>".
    const tasks = aliases.map((alias, index) =>
      task(
        alias.includes("SAMTOOLS") ? `${alias}:SAMTOOLS_SORT` : alias,
        "succeeded",
        `${String(index).padStart(2, "0")}/abcdef`,
      ),
    );
    const runs = summarizeNodeRuns(tasks, exampleNodes as Node[]);
    const covered = Object.values(runs).reduce((sum, run) => sum + run.total, 0);
    expect(covered).toBe(tasks.length);
    const labelled = Object.keys(runs).map(
      (id) => exampleNodes.find((node) => node.id === id)?.data.label,
    );
    expect(labelled).toContain("STAR alignment");
    expect(labelled).toContain("SAMtools sort, index, stats");
  });
});

describe("nodeIdForProcess", () => {
  const nodes = [
    { id: "demo-merge", type: "operator", position: { x: 0, y: 0 }, data: { operatorType: "merge" } },
  ] as Node[];

  it("finds the node that runs a failed process", () => {
    expect(nodeIdForProcess("MERGE_DEMO_MERGE", nodes)).toBe("demo-merge");
    expect(nodeIdForProcess("merge_demo_merge:INNER", nodes)).toBe("demo-merge");
    expect(nodeIdForProcess("UNKNOWN", nodes)).toBeUndefined();
  });

  it("gives a pipeline run's processes to its Pipeline node", () => {
    expect(nodeIdForProcess("NFCORE_RNASEQ:RNASEQ:FASTQC", nodes, "pipe")).toBe("pipe");
  });
});
