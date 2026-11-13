import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { buildLintFixtures } from "../../scripts/lint/fixtures";
import { lineOwners } from "../analysis/scriptLines";
import type { NodeData } from "../components/nodes/BaseNode";
import { generateNextflowScriptWithNames } from "../generators/core/generateNextflowScript";
import { importNextflowScript } from "../workflows/import/importScript";
import { codeConnections } from "./canvasViews";

const connectionsOf = (nodes: Node<NodeData>[], edges: Edge[]) => {
  const { script, names } = generateNextflowScriptWithNames(
    nodes,
    edges,
    "wf",
    "results",
  );
  return codeConnections(
    nodes,
    edges,
    script,
    names,
    lineOwners(script, names, nodes),
  );
};

const codeCallsStep = Object.values(
  import.meta.glob("../workflows/import/fixtures/code-calls-step.nf", { query: "?raw", import: "default", eager: true }),
)[0] as string;

const conditions = [
  "process QC {",
  "    input:",
  "    path reads",
  "    output:",
  "    path 'qc.txt'",
  "    script:",
  '    "touch qc.txt"',
  "}",
  "process TRIM {",
  "    input:",
  "    path reads",
  "    output:",
  "    path 'trimmed.fq', emit: reads",
  "    script:",
  '    "touch trimmed.fq"',
  "}",
  "process ALIGN {",
  "    input:",
  "    path reads",
  "    output:",
  "    path 'out.bam'",
  "    script:",
  '    "touch out.bam"',
  "}",
  "workflow {",
  "    ch_reads = channel.fromPath('reads/*.fq')",
  "    if (params.qc) {",
  "        QC(ch_reads)",
  "    }",
  "    if (params.trim) {",
  "        TRIM(ch_reads)",
  "        ch_align = TRIM.out.reads",
  "    } else {",
  "        ch_align = ch_reads",
  "    }",
  "    ALIGN(ch_align)",
  "}",
  "",
].join("\n");

describe("codeConnections", () => {
  it("finds the steps code calls and the outputs it reads that the canvas doesn't connect", () => {
    // `ch_trimmed = ch_reads | TRIM`: the code calls TRIM, which the canvas doesn't connect.
    const { nodes, edges } = importNextflowScript(codeCallsStep);
    const id = (label: string) => nodes.find((node) => node.data.label === label)?.id;
    expect(connectionsOf(nodes, edges).map(({ from, to, kind }) => ({ from, to, kind }))).toEqual([
      { from: id("TRIM"), to: id("ALIGN"), kind: "reads" },
    ]);
  });

  it("finds none for branches: their steps are in them, connected as the code reads", () => {
    const { nodes, edges } = importNextflowScript(conditions);
    expect(connectionsOf(nodes, edges)).toEqual([]);
    // `if (params.qc) { QC(ch_reads) }` and the if/else that passes ch_reads on are branches.
    expect(nodes.find((node) => node.data.label === "QC")?.data.branch).toMatchObject({ arm: "if" });
    expect(nodes.find((node) => node.data.label === "TRIM")?.data.branch).toMatchObject({ arm: "if" });
    expect(edges.some((edge) => (edge.data as { when?: { arm?: string } } | undefined)?.when?.arm === "else")).toBe(true);
  });

  it.each(
    buildLintFixtures().map((fixture) => [fixture.name, fixture] as const),
  )(
    "finds none in the %s fixture, which N-WAVE wrote from its own nodes",
    (_name, fixture) => {
      expect(connectionsOf(fixture.nodes, fixture.edges)).toEqual([]);
    },
  );
});
