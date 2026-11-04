import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { buildLintFixtures } from "../../scripts/lint/fixtures";
import { lineOwners } from "../analysis/scriptLines";
import type { NodeData } from "../components/nodes/BaseNode";
import { generateNextflowScriptWithNames } from "../generators/core/generateNextflowScript";
import { importNextflowScript } from "../workflows/import/importScript";
import { codeConnections, stepsOnlyView } from "./canvasViews";

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
    const { nodes, edges } = importNextflowScript(conditions);
    const id = (label: string) =>
      nodes.find((node) => node.data.label === label)?.id;
    const block = nodes.find((node) => node.type === "channelOperator")?.id;
    const found = connectionsOf(nodes, edges).map(({ from, to, kind }) => ({
      from,
      to,
      kind,
    }));
    expect(found).toEqual(
      expect.arrayContaining([
        { from: block, to: id("QC"), kind: "calls" },
        { from: block, to: id("TRIM"), kind: "calls" },
        { from: id("TRIM"), to: block, kind: "reads" },
      ]),
    );
    // ALIGN is connected on the canvas.
    expect(
      found.some(
        (connection) =>
          connection.to === id("ALIGN") || connection.from === id("ALIGN"),
      ),
    ).toBe(false);
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

describe("stepsOnlyView", () => {
  it("hides channel code and connects the steps through it", () => {
    const { nodes, edges } = importNextflowScript(conditions);
    const connections = connectionsOf(nodes, edges);
    const view = stepsOnlyView(nodes, edges, connections);
    const block = nodes.find((node) => node.type === "channelOperator")?.id;
    expect(view.nodes.find((node) => node.id === block)?.hidden).toBe(true);
    const label = (nodeId: string) =>
      nodes.find((node) => node.id === nodeId)?.data.label;
    const pairs = view.edges
      .map((edge) => `${label(edge.source)}->${label(edge.target)}`)
      .sort();
    // TRIM's reads reach ALIGN through the hidden block.
    expect(pairs).toContain("TRIM->ALIGN");
    // The block reads TRIM and calls QC, but not with TRIM's output.
    expect(pairs).not.toContain("TRIM->QC");
  });
});
