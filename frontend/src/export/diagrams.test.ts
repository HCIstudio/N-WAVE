import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../components/nodes/BaseNode";
import recorded from "../demo/analysisResults.json";
import type { BioflowResult } from "../analysis/bioflow";
import { type GraphModel, graphModel } from "../analysis/graphViews";
import { canvasDiagram, graphDiagram, renderDiagram, toSvg } from "./diagrams";

const node = (id: string, type: string, label: string, x: number, y: number): Node<NodeData> =>
  ({ id, type, position: { x, y }, data: { label } }) as Node<NodeData>;

const nodes = [
  node("in", "fileInput", "Reads", 0, 0),
  node("trim", "process", "Trim <fast>", 300, 0),
  node("join", "channelOperator", "Join", 600, 100),
  node("memo", "note", "A note", 0, 300),
];
const edges = [
  { id: "a", source: "in", target: "trim" },
  { id: "b", source: "trim", target: "join" },
  { id: "c", source: "memo", target: "join" },
  // A second port between the same steps: one arrow.
  { id: "d", source: "trim", target: "join", sourceHandle: "log" },
] as Edge[];

describe("diagrams", () => {
  it("draw the canvas's steps where they are, without notes", () => {
    const diagram = canvasDiagram(nodes, edges);
    expect(diagram.graph.nodes.map((entry) => [entry.id, entry.kind])).toEqual([
      ["in", "step"],
      ["trim", "step"],
      ["join", "operation"],
    ]);
    expect(diagram.graph.edges).toEqual([
      { from: "in", to: "trim" },
      { from: "trim", to: "join" },
    ]);
    expect(diagram.positions.get("join")).toEqual({ x: 600, y: 100 });
  });

  it("are drawn as SVG: a box per step, an arrow per connection, names escaped", () => {
    const svg = toSvg(canvasDiagram(nodes, edges));
    expect(svg.match(/<rect x=/g)).toHaveLength(3);
    expect(svg.match(/marker-end="url\(#arrow\)"/g)).toHaveLength(2);
    expect(svg).toContain("Trim &lt;fast&gt;");
    expect(svg).not.toContain("A note");
    // Everything inside the drawing, from the margin on.
    expect(svg).toMatch(/viewBox="0 0 828 196"/);
  });

  it("draw a graph view of the code as the view lays it out, with its subworkflows framed", () => {
    const results = Object.values(recorded as unknown as Record<string, { bioflow: { result: BioflowResult } }>).map(
      (entry) => entry.bioflow.result,
    );
    const rnaseq = results.find((result) => result.subworkflows.length > 0) as BioflowResult;
    const diagram = graphDiagram(graphModel(rnaseq, "dependencies") as GraphModel);
    expect(diagram.positions.size).toBe(rnaseq.steps.length);
    expect(diagram.frames?.map((frame) => frame.name).sort()).toEqual(["BAM_STATS_SAMTOOLS", "SAMTOOLS_SORT_INDEX_STATS"]);
    const svg = toSvg(diagram);
    expect(svg).toContain(">SAMTOOLS_SORT_INDEX_STATS</text>");
    expect(svg).toContain('stroke-dasharray="6 4"');
  });

  it("are written as Mermaid and Dot", async () => {
    const diagram = canvasDiagram(nodes, edges);
    expect(await (await renderDiagram(diagram, "mermaid", "QC")).text()).toContain("flowchart LR");
    expect(await (await renderDiagram(diagram, "dot", "QC")).text()).toContain('digraph "QC"');
    expect((await renderDiagram(diagram, "svg", "QC")).type).toBe("image/svg+xml");
  });
});
