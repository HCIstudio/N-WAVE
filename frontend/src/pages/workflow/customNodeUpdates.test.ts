import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import type { StoredCustomNode } from "../../registry/customNodes";
import { applyCustomNodeDefinition, removeCustomNode } from "./customNodeUpdates";

const definition = {
  id: "c1",
  label: "Count words v2",
  icon: "Hash",
  processType: "custom_c1",
  inputs: [
    { name: "text", label: "Text", kind: "path" },
    { name: "minLength", label: "Min length", kind: "val", defaultValue: "3" },
    { name: "mode", label: "Mode", kind: "val", defaultValue: "fast" },
  ],
  outputs: [{ name: "counts", label: "Counts" }],
} as unknown as StoredCustomNode;

const nodes = [
  {
    id: "n1",
    type: "process",
    position: { x: 0, y: 0 },
    data: { label: "old", customNodeId: "c1", customNodeValues: { minLength: "5" } },
  },
  { id: "n2", type: "process", position: { x: 0, y: 0 }, data: { label: "other" } },
] as Node<NodeData>[];
const edges = [
  { id: "in-ok", source: "n2", target: "n1", targetHandle: "text" },
  { id: "in-gone", source: "n2", target: "n1", targetHandle: "old" },
  { id: "out-ok", source: "n1", sourceHandle: "counts", target: "n2" },
  { id: "out-gone", source: "n1", sourceHandle: "summary", target: "n2" },
] as Edge[];

describe("applyCustomNodeDefinition", () => {
  it("updates placed nodes, keeps set values and drops stale connections", () => {
    const next = applyCustomNodeDefinition(nodes, edges, definition);
    const updated = next?.nodes[0].data;
    expect(updated).toMatchObject({
      label: "Count words v2",
      subtitle: "Custom node",
      processType: "custom_c1",
      customNodeValues: { minLength: "5", mode: "fast" },
    });
    expect(updated?.inputs?.map((port) => port.name)).toEqual(["text"]);
    expect(updated?.outputs?.map((port) => port.name)).toEqual(["counts"]);
    expect(next?.nodes[1]).toBe(nodes[1]);
    expect(next?.edges.map((edge) => edge.id)).toEqual(["in-ok", "out-ok"]);
  });

  it("checks both ends of an edge between two placed copies", () => {
    const copies = [
      nodes[0],
      { ...nodes[0], id: "n3" },
    ] as Node<NodeData>[];
    const next = applyCustomNodeDefinition(
      copies,
      [
        { id: "ok", source: "n1", sourceHandle: "counts", target: "n3", targetHandle: "text" },
        { id: "gone", source: "n1", sourceHandle: "counts", target: "n3", targetHandle: "old" },
      ] as Edge[],
      definition,
    );
    expect(next?.edges.map((edge) => edge.id)).toEqual(["ok"]);
  });

  it("is null when the workflow doesn't use the custom node", () => {
    expect(applyCustomNodeDefinition([nodes[1]], [], definition)).toBeNull();
  });
});

describe("removeCustomNode", () => {
  it("removes placed nodes and their connections", () => {
    const next = removeCustomNode(nodes, edges, "c1");
    expect(next?.nodes.map((node) => node.id)).toEqual(["n2"]);
    expect(next?.edges).toEqual([]);
    expect(removeCustomNode(nodes, edges, "unused")).toBeNull();
  });
});
