import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../components/nodes/BaseNode";
import { canvasDiagram, laidOutDiagram, renderDiagram, toSvg } from "./diagrams";

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

  it("lay out a graph without positions left to right", () => {
    const diagram = laidOutDiagram({
      nodes: [
        { id: "A", kind: "step", label: "A", subworkflow: null },
        { id: "B", kind: "step", label: "B", subworkflow: null },
      ],
      edges: [{ from: "A", to: "B" }],
    });
    expect((diagram.positions.get("B")?.x ?? 0) > (diagram.positions.get("A")?.x ?? 0)).toBe(true);
  });

  it("are written as Mermaid and Dot", async () => {
    const diagram = canvasDiagram(nodes, edges);
    expect(await (await renderDiagram(diagram, "mermaid", "QC")).text()).toContain("flowchart LR");
    expect(await (await renderDiagram(diagram, "dot", "QC")).text()).toContain('digraph "QC"');
    expect((await renderDiagram(diagram, "svg", "QC")).type).toBe("image/svg+xml");
  });
});
