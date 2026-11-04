import { describe, expect, it } from "vitest";
import recorded from "../demo/analysisResults.json";
import type { BioflowResult } from "./bioflow";
import { longestPath, structureGraph, structureMetrics, toDot, toMermaid } from "./structure";

const results = Object.values(recorded as unknown as Record<string, { bioflow: { result: BioflowResult } }>).map(
  (entry) => entry.bioflow.result,
);
// The rebuilt RNA-seq example: the one with subworkflows.
const rnaseq = results.find((result) => result.subworkflows.length > 0) as BioflowResult;

describe("structure", () => {
  it("has the steps view and the steps-and-channels view", () => {
    const steps = structureGraph(rnaseq, "steps");
    expect(steps?.nodes.length).toBe(rnaseq.steps.length);
    expect(steps?.edges.length).toBe(rnaseq.connections.length);
    const channels = structureGraph(rnaseq, "channels");
    expect(channels?.nodes.some((node) => node.kind === "operation")).toBe(true);
    expect(channels?.nodes.filter((node) => node.kind === "step").length).toBe(rnaseq.steps.length);
    expect(structureGraph({ ...rnaseq, specification: null }, "channels")).toBeNull();
  });

  it("counts the longest path in steps, through operations and past loops", () => {
    expect(
      longestPath({
        nodes: [
          { id: "A", kind: "step", label: "A", subworkflow: null },
          { id: "op1", kind: "operation", label: "x", subworkflow: null },
          { id: "B", kind: "step", label: "B", subworkflow: null },
          { id: "C", kind: "step", label: "C", subworkflow: null },
        ],
        edges: [
          { from: "A", to: "op1" },
          { from: "op1", to: "B" },
          { from: "B", to: "C" },
          { from: "C", to: "B" },
        ],
      }),
    ).toBe(3);
    const metrics = structureMetrics(rnaseq);
    expect(metrics.steps).toBe(rnaseq.steps.length);
    expect(metrics.longestPath).toBeGreaterThan(3);
  });

  it("writes Mermaid and Dot", () => {
    const graph = {
      nodes: [
        { id: "A", kind: "step" as const, label: 'say "hi"', subworkflow: null },
        { id: "op1", kind: "operation" as const, label: "ch.map { x -> x }", subworkflow: null },
      ],
      edges: [{ from: "A", to: "op1" }],
    };
    expect(toMermaid(graph)).toBe('flowchart LR\n    n1["say #quot;hi#quot;"]\n    n2("ch.map { x -> x }")\n    n1 --> n2\n');
    expect(toDot(graph, "wf")).toBe(
      'digraph "wf" {\n    rankdir=LR;\n    "A" [label="say \\"hi\\"", shape=box];\n    "op1" [label="ch.map { x -> x }", shape=ellipse];\n    "A" -> "op1";\n}\n',
    );
  });
});
