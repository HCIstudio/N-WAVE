import { describe, expect, it } from "vitest";
import { toDot, toMermaid } from "./structure";

describe("structure", () => {
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

  it("draws subworkflows around their nodes, nested", () => {
    const graph = {
      nodes: [
        { id: "A", kind: "step" as const, label: "A", subworkflow: null },
        { id: "S.B", kind: "step" as const, label: "B", subworkflow: "S" },
        { id: "S.T.C", kind: "step" as const, label: "C", subworkflow: "S.T" },
      ],
      edges: [
        { from: "A", to: "S.B" },
        { from: "S.B", to: "S.T.C" },
      ],
      clusters: [
        { id: "S", name: "ALIGN", parent: null },
        { id: "S.T", name: "STATS", parent: "S" },
      ],
    };
    expect(toMermaid(graph)).toBe(
      [
        "flowchart LR",
        '    n1["A"]',
        '    subgraph s1["ALIGN"]',
        '        n2["B"]',
        '        subgraph s2["STATS"]',
        '            n3["C"]',
        "        end",
        "    end",
        "    n1 --> n2",
        "    n2 --> n3",
        "",
      ].join("\n"),
    );
    expect(toDot(graph, "wf")).toContain('    subgraph cluster_1 { label="ALIGN";\n        "S.B"');
    expect(toDot(graph, "wf")).toContain('        subgraph cluster_2 { label="STATS";\n            "S.T.C"');
  });
});
