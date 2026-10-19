import { act, renderHook } from "@testing-library/react";
import { type Edge, type Node, ReactFlowProvider } from "@xyflow/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
// Imported before the node definitions: they import the panels, which import
// this module, and the other order leaves its registry imports unresolved.
import { useWorkflowContext, WorkflowProvider } from "./WorkflowContext";
import type { NodeData } from "../components/nodes/BaseNode";
import { nodeDefinitions } from "../registry/nodeDefinitions";

/** A canvas node created the way the "Add node" menu creates it. */
const makeNode = (
  definitionId: string,
  extra: Partial<NodeData> = {},
): Node<NodeData> => {
  const definition = nodeDefinitions.find((entry) => entry.id === definitionId);
  if (!definition) throw new Error(`No node definition ${definitionId}`);
  return {
    id: `node-${definitionId}`,
    type: definition.type,
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      icon: definition.icon,
      ...definition.defaults,
      ...extra,
    },
  };
};

const node = (id: string, definitionId: string, extra: Partial<NodeData> = {}) => ({
  ...makeNode(definitionId, extra),
  id,
});

// updateNodeData and the connection checks read the graph from React Flow's
// store, which the canvas fills in the app.
const setup = (nodes: Node<NodeData>[] = [], edges: Edge[] = []) => {
  const wrapper = ({ children }: PropsWithChildren) => (
    <ReactFlowProvider initialNodes={nodes} initialEdges={edges}>
      <WorkflowProvider>{children}</WorkflowProvider>
    </ReactFlowProvider>
  );
  const hook = renderHook(() => useWorkflowContext(), { wrapper });
  act(() => hook.result.current.setNodes(nodes));
  return hook;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("WorkflowContext", () => {
  it("requires a WorkflowProvider", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useWorkflowContext())).toThrow(
      "useWorkflowContext must be used within a WorkflowProvider",
    );
    error.mockRestore();
  });

  it("starts empty and clean", () => {
    const { result } = renderHook(() => useWorkflowContext(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <ReactFlowProvider>
          <WorkflowProvider>{children}</WorkflowProvider>
        </ReactFlowProvider>
      ),
    });
    expect(result.current.nodes).toEqual([]);
    expect(result.current.edges).toEqual([]);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.toast).toBeNull();
  });

  it("applies node changes and marks the workflow dirty", () => {
    const { result } = setup([node("a", "map")]);
    act(() =>
      result.current.onNodesChange([
        { type: "position", id: "a", position: { x: 40, y: 20 } },
      ]),
    );
    expect(result.current.nodes[0].position).toEqual({ x: 40, y: 20 });
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.setIsDirty(false));
    expect(result.current.isDirty).toBe(false);
  });

  it("merges node data and ignores patches that change nothing", () => {
    const { result } = setup([node("a", "map"), node("b", "filter")]);
    const before = result.current.nodes;
    act(() => result.current.updateNodeData("a", { mapChangeCase: "toUpperCase" }));
    expect(result.current.nodes).toBe(before);
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.updateNodeData("missing", { label: "x" }));
    expect(result.current.nodes).toBe(before);

    act(() => result.current.updateNodeData("a", { mapChangeCase: "toLowerCase" }));
    expect(result.current.nodes[0].data).toEqual(
      expect.objectContaining({ mapChangeCase: "toLowerCase", label: "Map" }),
    );
    expect(result.current.nodes[1]).toBe(before[1]);
    expect(result.current.isDirty).toBe(true);
  });

  it("refreshes every node downstream of a file input when its files change", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    const { result } = setup(
      [node("in", "fileInput"), node("f", "filter"), node("m", "map"), node("x", "merge")],
      [
        { id: "e1", source: "in", target: "f" },
        { id: "e2", source: "f", target: "m" },
        // A cycle must not recurse forever.
        { id: "e3", source: "m", target: "f" },
      ],
    );
    act(() =>
      result.current.updateNodeData("in", {
        files: [{ name: "a.txt", content: "a", size: 1 }],
      }),
    );
    const refreshed = Object.fromEntries(
      result.current.nodes.map((n) => [n.id, n.data._refreshTimestamp]),
    );
    const now = new Date("2026-10-18T12:00:00Z").getTime();
    expect(refreshed).toEqual({ in: undefined, f: now, m: now, x: undefined });
  });

  it("sends zip and html outputs to connected output displays", () => {
    const { result } = setup(
      [
        node("p", "process"),
        node("zipView", "outputDisplay"),
        node("htmlView", "outputDisplay"),
        node("other", "map"),
      ],
      [
        { id: "e1", source: "p", sourceHandle: "zip", target: "zipView" },
        { id: "e2", source: "p", sourceHandle: "html", target: "htmlView" },
        { id: "e3", source: "p", sourceHandle: "zip", target: "other" },
      ],
    );
    act(() =>
      result.current.updateNodeData("p", {
        zipOutput: { fileName: "out.zip", content: "PK" },
        htmlOutput: { fileName: "report.html", content: "<p>hi</p>" },
      }),
    );
    const byId = (id: string) => result.current.nodes.find((n) => n.id === id);
    expect(byId("zipView")?.data.files).toEqual([
      { name: "out.zip", content: "PK", size: 2, fileType: "zip" },
    ]);
    expect(byId("htmlView")?.data.files).toEqual([
      { name: "report.html", content: "<p>hi</p>", size: 9, fileType: "html" },
    ]);
    expect(byId("other")?.data.files).toBeUndefined();
  });

  it("numbers new edges by the target's existing inputs and lets them delete themselves", () => {
    const { result } = setup(
      [node("a", "fileInput"), node("b", "fileInput"), node("m", "merge")],
      [{ id: "existing", source: "a", target: "m" }],
    );
    act(() =>
      result.current.onConnect({
        source: "b",
        target: "m",
        sourceHandle: "out",
        targetHandle: "in",
      }),
    );
    const [edge] = result.current.edges;
    expect(edge).toEqual(
      expect.objectContaining({
        id: "e-b-out-m-in",
        source: "b",
        target: "m",
        type: "default",
        data: expect.objectContaining({ order: 1 }),
      }),
    );
    expect(result.current.isDirty).toBe(true);
  });

  it("gives two edges between the same nodes different ids", () => {
    const { result } = setup([node("p", "parameters"), node("m", "merge")]);
    for (const handle of ["fasta", "gtf"]) {
      act(() =>
        result.current.onConnect({
          source: "p",
          target: "m",
          sourceHandle: handle,
          targetHandle: handle,
        }),
      );
    }
    expect(result.current.edges).toHaveLength(2);
    const [first, second] = result.current.edges;
    expect(first.id).not.toBe(second.id);
  });

  it("rejects invalid connections with an error toast", () => {
    const { result } = setup([node("a", "map"), node("b", "filter")]);
    let valid = true;
    act(() => {
      valid = result.current.isValidConnection({
        source: "a",
        target: "a",
        sourceHandle: "out",
        targetHandle: "in",
      });
    });
    expect(valid).toBe(false);
    expect(result.current.toast).toEqual(
      expect.objectContaining({
        message: "A node can't be connected to itself.",
        type: "error",
      }),
    );
    expect(
      result.current.isValidConnection({ id: "e", source: "a", target: "b" }),
    ).toBe(true);
  });

  it("shows one toast at a time until it is closed or times out", () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => result.current.showToast("Saved", "success"));
    act(() => result.current.showToast("Ignored", "error"));
    expect(result.current.toast?.message).toBe("Saved");

    act(() => result.current.closeToast());
    expect(result.current.toast).toBeNull();

    act(() => result.current.showToast("Again", "info"));
    expect(result.current.toast?.message).toBe("Again");
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.toast).toBeNull();
  });

  it("keeps the no-op connection handlers callable", () => {
    const { result } = setup();
    expect(() => {
      result.current.onConnectStart(new MouseEvent("mousedown"), {
        nodeId: null,
        handleId: null,
        handleType: null,
      });
      result.current.onConnectEnd(new MouseEvent("mouseup"), {} as never);
    }).not.toThrow();
  });
});
