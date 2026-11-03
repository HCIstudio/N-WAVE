import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { autoLayout } from "./autoLayout";

const node = (id: string, type = "process", x = 0, y = 0): Node => ({ id, type, position: { x, y }, data: {} });

describe("autoLayout", () => {
  it("puts steps in columns by how many steps come before, notes above", () => {
    const nodes = [node("a"), node("b"), node("c"), node("n", "note")];
    const edges: Edge[] = [
      { id: "1", source: "a", target: "b" },
      { id: "2", source: "a", target: "c" },
    ];
    autoLayout(nodes, edges);
    expect(nodes.map((entry) => [entry.id, entry.position.x, entry.position.y])).toEqual([
      ["a", 0, 0],
      ["b", 280, 0],
      ["c", 280, 150],
      ["n", 0, -225],
    ]);
  });

  it("keeps placed nodes and doesn't put others on them", () => {
    const nodes = [node("placed", "process", 0, 0), node("new")];
    autoLayout(nodes, [], new Set(["placed"]));
    expect(nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(nodes[1].position).toEqual({ x: 0, y: 150 });
  });
});
