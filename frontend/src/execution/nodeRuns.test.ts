import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { RunTask } from "../api/runs";
import { generateNextflowScript } from "../generators/core/generateNextflowScript";
import { registerDynamicNodeDefinitions } from "../registry/nodeDefinitions";
import { buildRnaseqStarSalmonExample } from "../test/examples/rnaseqStarSalmon";
import { summarizeNodeRuns } from "./nodeRuns";

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

  it("gives every task to the pipeline node when a whole pipeline runs", () => {
    const runs = summarizeNodeRuns(
      [task("NFCORE_RNASEQ:RNASEQ:FASTQC", "running")],
      nodes,
      "pipeline-1",
    );
    expect(Object.keys(runs)).toEqual(["pipeline-1"]);
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
