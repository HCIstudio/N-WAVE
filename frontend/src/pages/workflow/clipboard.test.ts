import type { Edge, Node } from "@xyflow/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import {
  clearClipboard,
  copySelection,
  PASTE_OFFSET,
  pasteContent,
  readClipboard,
  writeClipboard,
} from "./clipboard";

const node = (id: string, x: number, extra: Partial<Node<NodeData>> = {}): Node<NodeData> => ({
  id,
  type: "operator",
  position: { x, y: 0 },
  data: { label: id, filterText: `text of ${id}` },
  ...extra,
});
const edge = (source: string, target: string): Edge => ({
  id: `e-${source}-out-${target}-in`,
  source,
  target,
  sourceHandle: "out",
  targetHandle: "in",
  data: { order: 0, onDelete: () => {} },
});

const nodes = [
  node("a", 0, { selected: true, measured: { width: 100, height: 40 } }),
  node("b", 200, { selected: true }),
  node("c", 400),
];
const edges = [edge("a", "b"), edge("b", "c")];
const newId = (index: number) => `new-${index}`;

describe("copySelection", () => {
  it("takes the selected nodes and only the connections between them", () => {
    const content = copySelection(nodes, edges);
    expect(content?.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(content?.edges.map((e) => [e.source, e.target])).toEqual([["a", "b"]]);
  });

  it("leaves out the canvas's own state and a pipeline's last run", () => {
    const content = copySelection(
      [node("p", 0, { selected: true, dragging: true, data: { label: "p", pipelineLastRun: { id: "r" } } })],
      [],
    );
    expect(content?.nodes[0]).toEqual({
      id: "p",
      type: "operator",
      position: { x: 0, y: 0 },
      data: { label: "p" },
    });
    expect(copySelection(nodes, edges)?.edges[0]).not.toHaveProperty("data");
  });

  it("copies nothing without a selection", () => {
    expect(copySelection([node("c", 0)], [])).toBeNull();
  });
});

describe("pasteContent", () => {
  const content = () => {
    const copied = copySelection(nodes, edges);
    if (!copied) throw new Error("nothing copied");
    return copied;
  };

  it("gives the copies new ids, connected to each other, beside the originals", () => {
    const pasted = pasteContent(content(), nodes, newId);
    expect(pasted.nodes.map((n) => [n.id, n.position, n.selected])).toEqual([
      ["new-0", { x: PASTE_OFFSET, y: PASTE_OFFSET }, true],
      ["new-1", { x: 200 + PASTE_OFFSET, y: PASTE_OFFSET }, true],
    ]);
    expect(pasted.nodes[0].data.filterText).toBe("text of a");
    expect(pasted.edges).toEqual([
      expect.objectContaining({
        id: "e-new-0-out-new-1-in",
        source: "new-0",
        target: "new-1",
        sourceHandle: "out",
        targetHandle: "in",
      }),
    ]);
  });

  it("moves further with each paste onto the same spot", () => {
    const first = pasteContent(content(), nodes, newId);
    const second = pasteContent(content(), [...nodes, ...first.nodes], (i) => `next-${i}`);
    expect(second.nodes[0].position).toEqual({ x: 2 * PASTE_OFFSET, y: 2 * PASTE_OFFSET });
  });

  it("keeps the positions in a workflow where they are free", () => {
    const pasted = pasteContent(content(), [node("z", 900)], newId);
    expect(pasted.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("doesn't share settings with the copied nodes", () => {
    const copied = content();
    const pasted = pasteContent(copied, [], newId);
    pasted.nodes[0].data.filterText = "changed";
    expect(copied.nodes[0].data.filterText).toBe("text of a");
  });
});

describe("the clipboard", () => {
  beforeEach(() => {
    localStorage.clear();
    clearClipboard();
  });

  it("is kept in browser storage, for other workflows", () => {
    const copied = copySelection(nodes, edges);
    if (!copied) throw new Error("nothing copied");
    writeClipboard(copied);
    expect(JSON.parse(localStorage.getItem("nwave.clipboard") ?? "{}").nodes).toHaveLength(2);
    expect(readClipboard()?.nodes.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("ignores stored content it can't use", () => {
    localStorage.setItem("nwave.clipboard", JSON.stringify({ version: 1, nodes: [null], edges: [] }));
    const fallback = readClipboard();
    expect(fallback?.nodes.every((n) => n !== null) ?? true).toBe(true);
  });
});
