import { act, renderHook } from "@testing-library/react";
import type { Edge, Node } from "@xyflow/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import { HISTORY_LIMIT, HISTORY_SETTLE_MS, useCanvasHistory } from "./useCanvasHistory";

const node = (id: string, x = 0, data: Partial<NodeData> = {}): Node<NodeData> => ({
  id,
  type: "process",
  position: { x, y: 0 },
  data: { label: id, ...data },
});
const edge: Edge = { id: "e-a-b", source: "a", target: "b" };

interface HarnessProps {
  enabled?: boolean;
  isLoading?: boolean;
  documentKey?: string;
}

const setup = (initialNodes = [node("a"), node("b")], initialEdges = [edge]) => {
  const setIsDirty = vi.fn();
  const hook = renderHook(
    ({ enabled = true, isLoading = false, documentKey = "wf1" }: HarnessProps) => {
      const [nodes, setNodes] = useState(initialNodes);
      const [edges, setEdges] = useState(initialEdges);
      const history = useCanvasHistory({
        nodes,
        edges,
        setNodes,
        setEdges,
        setIsDirty,
        enabled,
        documentKey,
        isLoading,
      });
      return { nodes, edges, setNodes, setEdges, history };
    },
    { initialProps: {} as HarnessProps },
  );
  const settle = () =>
    act(() => {
      vi.advanceTimersByTime(HISTORY_SETTLE_MS);
    });
  const change = (fn: (current: typeof hook.result.current) => void) => {
    act(() => fn(hook.result.current));
  };
  // The opened workflow settles before anyone edits it: history starts there.
  settle();
  return { ...hook, settle, change, setIsDirty };
};

const ids = (nodes: Node[]) => nodes.map((n) => n.id);
const pressKey = (key: string, options: KeyboardEventInit = {}, target: EventTarget = window) =>
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, ...options }),
    );
  });

describe("useCanvasHistory", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("undoes and redoes deleting a node and its connection", () => {
    const { result, change, settle, setIsDirty } = setup();
    expect(result.current.history.canUndo).toBe(false);
    change(({ setNodes, setEdges }) => {
      setNodes((nodes) => nodes.filter((n) => n.id !== "b"));
      setEdges([]);
    });
    settle();
    expect(result.current.history.canUndo).toBe(true);

    act(() => result.current.history.undo());
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
    expect(result.current.edges).toEqual([edge]);
    expect(result.current.history.canRedo).toBe(true);
    expect(setIsDirty).toHaveBeenCalledWith(true);

    act(() => result.current.history.redo());
    expect(ids(result.current.nodes)).toEqual(["a"]);
    expect(result.current.edges).toEqual([]);
  });

  it("makes each added node and connection a step, however quick", () => {
    const { result, change, settle } = setup([], []);
    change(({ setNodes }) => setNodes([node("a")]));
    act(() => {
      vi.advanceTimersByTime(150);
    });
    change(({ setNodes }) => setNodes((nodes) => [...nodes, node("b", 200)]));
    act(() => {
      vi.advanceTimersByTime(150);
    });
    change(({ setEdges }) => setEdges([edge]));
    settle();
    act(() => result.current.history.undo());
    expect(result.current.edges).toEqual([]);
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
    act(() => result.current.history.undo());
    expect(ids(result.current.nodes)).toEqual(["a"]);
    act(() => result.current.history.undo());
    expect(ids(result.current.nodes)).toEqual([]);
    expect(result.current.history.canUndo).toBe(false);
  });

  it("keeps two quick additions apart, like pressing Ctrl+D twice", () => {
    const { result, change, settle } = setup([node("a")], []);
    change(({ setNodes }) => setNodes((nodes) => [...nodes, node("b", 40)]));
    change(({ setNodes }) => setNodes((nodes) => [...nodes, node("c", 80)]));
    settle();
    act(() => result.current.history.undo());
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
  });

  it("makes one step of a node removed with its connections in two updates", () => {
    const { result, change, settle } = setup();
    change(({ setNodes }) => setNodes((nodes) => nodes.slice(0, 1)));
    change(({ setEdges }) => setEdges([]));
    settle();
    act(() => result.current.history.undo());
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
    expect(result.current.edges).toEqual([edge]);
    expect(result.current.history.canUndo).toBe(false);
  });

  it("keeps an edit that hadn't settled as its own step before a removal", () => {
    const { result, change, settle } = setup();
    change(({ setNodes }) =>
      setNodes((nodes) =>
        nodes.map((n) => (n.id === "a" ? { ...n, data: { ...n.data, label: "Renamed" } } : n)),
      ),
    );
    act(() => {
      vi.advanceTimersByTime(200);
    });
    change(({ setNodes }) => setNodes((nodes) => nodes.filter((n) => n.id !== "b")));
    settle();
    act(() => result.current.history.undo());
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
    expect(result.current.nodes[0].data.label).toBe("Renamed");
    act(() => result.current.history.undo());
    expect(result.current.nodes[0].data.label).toBe("a");
  });

  it("makes one step of edits that follow each other quickly, like typing", () => {
    const { result, change, settle } = setup();
    for (const label of ["F", "Fi", "Fil"]) {
      change(({ setNodes }) =>
        setNodes((nodes) =>
          nodes.map((n) => (n.id === "a" ? { ...n, data: { ...n.data, label } } : n)),
        ),
      );
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    settle();
    act(() => result.current.history.undo());
    expect(result.current.nodes[0].data.label).toBe("a");
    expect(result.current.history.canUndo).toBe(false);
  });

  it("makes one step of a drag, once it ends", () => {
    const { result, change, settle } = setup();
    const move = (x: number, dragging: boolean) =>
      change(({ setNodes }) =>
        setNodes((nodes) =>
          nodes.map((n) => (n.id === "a" ? { ...n, position: { x, y: 0 }, dragging } : n)),
        ),
      );
    move(10, true);
    settle();
    move(50, true);
    settle();
    expect(result.current.history.canUndo).toBe(false);
    move(80, false);
    settle();
    act(() => result.current.history.undo());
    expect(result.current.nodes[0].position.x).toBe(0);
    expect(result.current.history.canUndo).toBe(false);
  });

  it("doesn't make steps of selecting or measuring nodes", () => {
    const { result, change, settle } = setup();
    change(({ setNodes }) =>
      setNodes((nodes) =>
        nodes.map((n) => ({ ...n, selected: true, measured: { width: 100, height: 40 } })),
      ),
    );
    settle();
    expect(result.current.history.canUndo).toBe(false);
  });

  it("keeps redo when nodes write their derived data after an undo", () => {
    const { result, change, settle } = setup();
    change(({ setNodes }) => setNodes((nodes) => [...nodes, node("c", 200)]));
    settle();
    act(() => result.current.history.undo());
    // A node writing back data right after the undo, before the canvas settles.
    change(({ setNodes }) =>
      setNodes((nodes) =>
        nodes.map((n) => (n.id === "a" ? { ...n, data: { ...n.data, subtitle: "1 file" } } : n)),
      ),
    );
    settle();
    expect(result.current.history.canRedo).toBe(true);
    act(() => result.current.history.redo());
    expect(ids(result.current.nodes)).toEqual(["a", "b", "c"]);
  });

  it("makes a move right after an undo a step of its own", () => {
    const { result, change, settle } = setup();
    change(({ setNodes }) => setNodes((nodes) => [...nodes, node("c", 200)]));
    settle();
    act(() => result.current.history.undo());
    change(({ setNodes }) =>
      setNodes((nodes) => nodes.map((n) => (n.id === "a" ? { ...n, position: { x: 90, y: 0 } } : n))),
    );
    settle();
    act(() => result.current.history.undo());
    expect(result.current.nodes[0].position.x).toBe(0);
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
  });

  it("starts a new history after an edit that follows an undo", () => {
    const { result, change, settle } = setup();
    change(({ setNodes }) => setNodes((nodes) => [...nodes, node("c")]));
    settle();
    act(() => result.current.history.undo());
    settle();
    change(({ setNodes }) => setNodes((nodes) => nodes.slice(0, 1)));
    settle();
    expect(result.current.history.canRedo).toBe(false);
    act(() => result.current.history.undo());
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
  });

  it("undoes a change that hasn't settled yet", () => {
    const { result, change } = setup();
    change(({ setNodes }) => setNodes((nodes) => nodes.slice(0, 1)));
    act(() => result.current.history.undo());
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
  });

  it("keeps a run's record on a node when undoing", () => {
    const { result, change, settle } = setup([node("p")], []);
    change(({ setNodes }) => setNodes((nodes) => [...nodes, node("q")]));
    settle();
    const lastRun = { id: "run_1", finishedAt: "now", success: true };
    change(({ setNodes }) =>
      setNodes((nodes) =>
        nodes.map((n) => (n.id === "p" ? { ...n, data: { ...n.data, pipelineLastRun: lastRun } } : n)),
      ),
    );
    settle();
    act(() => result.current.history.undo());
    expect(ids(result.current.nodes)).toEqual(["p"]);
    expect(result.current.nodes[0].data.pipelineLastRun).toEqual(lastRun);
  });

  it("answers Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y, but not in text fields", () => {
    const { result, change, settle } = setup();
    change(({ setNodes }) => setNodes((nodes) => nodes.slice(0, 1)));
    settle();

    const input = document.createElement("input");
    document.body.append(input);
    pressKey("z", {}, input);
    expect(ids(result.current.nodes)).toEqual(["a"]);
    input.remove();

    pressKey("z");
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
    pressKey("Z", { shiftKey: true });
    expect(ids(result.current.nodes)).toEqual(["a"]);
    pressKey("z", { ctrlKey: false, metaKey: true });
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
    pressKey("y");
    expect(ids(result.current.nodes)).toEqual(["a"]);
  });

  it("does nothing while disabled, as during a run or on a read-only example", () => {
    const { result, change, settle, rerender } = setup();
    change(({ setNodes }) => setNodes((nodes) => nodes.slice(0, 1)));
    settle();
    rerender({ enabled: false });
    expect(result.current.history.canUndo).toBe(false);
    act(() => result.current.history.undo());
    pressKey("z");
    expect(ids(result.current.nodes)).toEqual(["a"]);
    rerender({ enabled: true });
    act(() => result.current.history.undo());
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
  });

  it("doesn't count loading a workflow, or what nodes derive then, as a step", () => {
    const { result, change, settle, rerender } = setup([], []);
    rerender({ isLoading: true });
    change(({ setNodes }) => setNodes([node("a")]));
    rerender({ isLoading: false });
    // A node writing derived data just after it mounts.
    change(({ setNodes }) =>
      setNodes((nodes) => nodes.map((n) => ({ ...n, data: { ...n.data, subtitle: "ready" } }))),
    );
    settle();
    expect(result.current.history.canUndo).toBe(false);

    change(({ setNodes }) => setNodes((nodes) => [...nodes, node("b")]));
    settle();
    expect(result.current.history.canUndo).toBe(true);
    rerender({ documentKey: "wf2" });
    expect(result.current.history.canUndo).toBe(false);
  });

  it(`keeps the last ${HISTORY_LIMIT} steps`, () => {
    const { result, change, settle } = setup([node("a")], []);
    for (let x = 1; x <= HISTORY_LIMIT + 5; x++) {
      change(({ setNodes }) => setNodes([node("a", x * 10)]));
      settle();
    }
    let undone = 0;
    while (result.current.history.canUndo) {
      act(() => result.current.history.undo());
      undone++;
    }
    expect(undone).toBe(HISTORY_LIMIT);
    expect(result.current.nodes[0].position.x).toBe(50);
  });
});
