import { act, renderHook } from "@testing-library/react";
import type { Edge, Node } from "@xyflow/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import { clearClipboard } from "./clipboard";
import { READ_ONLY_EDIT_MESSAGE, useCanvasShortcuts } from "./useCanvasShortcuts";

const node = (id: string, x: number, selected = false): Node<NodeData> => ({
  id,
  type: "operator",
  position: { x, y: 0 },
  data: { label: id },
  selected,
});
const edge: Edge = { id: "e-a-out-b-in", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" };

interface Props {
  readOnly?: boolean;
  running?: boolean;
}

const setup = (initialNodes = [node("a", 0, true), node("b", 200, true), node("c", 400)]) => {
  const callbacks = {
    showToast: vi.fn(),
    onSave: vi.fn(),
    onRun: vi.fn(),
    onFitView: vi.fn(),
    onShowShortcuts: vi.fn(),
    setIsDirty: vi.fn(),
  };
  const hook = renderHook(
    ({ readOnly = false, running = false }: Props) => {
      const [nodes, setNodes] = useState(initialNodes);
      const [edges, setEdges] = useState([edge]);
      useCanvasShortcuts({
        nodes,
        edges,
        setNodes,
        setEdges,
        enabled: true,
        readOnly,
        blockedByRun: () => {
          if (running) callbacks.showToast("locked", "info");
          return running;
        },
        ...callbacks,
      });
      return { nodes, edges, setNodes };
    },
    { initialProps: {} as Props },
  );
  return { ...hook, ...callbacks };
};

const press = (key: string, options: KeyboardEventInit = {}, target: EventTarget = window) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));
  });
const ids = (nodes: Node[]) => nodes.map((n) => n.id);

describe("useCanvasShortcuts", () => {
  beforeEach(() => {
    localStorage.clear();
    clearClipboard();
    window.getSelection()?.removeAllRanges();
  });

  it("copies and pastes the selected nodes with their connection", () => {
    const { result, setIsDirty } = setup();
    press("c", { ctrlKey: true });
    press("v", { ctrlKey: true });
    expect(result.current.nodes).toHaveLength(5);
    const pasted = result.current.nodes.slice(3);
    expect(pasted.every((n) => n.selected)).toBe(true);
    expect(result.current.nodes.slice(0, 3).some((n) => n.selected)).toBe(false);
    expect(result.current.edges).toHaveLength(2);
    expect(result.current.edges[1]).toMatchObject({ source: pasted[0].id, target: pasted[1].id });
    expect(typeof result.current.edges[1].data?.onDelete).toBe("function");
    expect(setIsDirty).toHaveBeenCalledWith(true);
  });

  it("pastes what another workflow copied", () => {
    const first = setup();
    press("c", { ctrlKey: true });
    first.unmount();
    const second = setup([node("z", 900)]);
    press("v", { metaKey: true });
    expect(second.result.current.nodes).toHaveLength(3);
    expect(second.result.current.edges).toHaveLength(2);
  });

  it("cuts the selected nodes and their connections", () => {
    const { result } = setup();
    press("x", { ctrlKey: true });
    expect(ids(result.current.nodes)).toEqual(["c"]);
    expect(result.current.edges).toEqual([]);
    press("v", { ctrlKey: true });
    expect(result.current.nodes).toHaveLength(3);
    expect(result.current.edges).toHaveLength(1);
  });

  it("duplicates the selection without touching the clipboard", () => {
    const { result } = setup();
    press("d", { ctrlKey: true });
    expect(result.current.nodes).toHaveLength(5);
    expect(localStorage.getItem("nwave.clipboard")).toBeNull();
  });

  it("selects all nodes", () => {
    const { result } = setup();
    press("a", { ctrlKey: true });
    expect(result.current.nodes.every((n) => n.selected)).toBe(true);
  });

  it("saves, runs, fits the view and shows the shortcuts", () => {
    const { onSave, onRun, onFitView, onShowShortcuts } = setup();
    press("s", { ctrlKey: true });
    press("Enter", { ctrlKey: true });
    press("f");
    press("?", { shiftKey: true });
    expect(onSave).toHaveBeenCalledOnce();
    expect(onRun).toHaveBeenCalledOnce();
    expect(onFitView).toHaveBeenCalledOnce();
    expect(onShowShortcuts).toHaveBeenCalledOnce();
  });

  it("copies from a read-only example but doesn't change it", () => {
    const { result, rerender, showToast, onSave } = setup();
    rerender({ readOnly: true });
    press("c", { ctrlKey: true });
    expect(localStorage.getItem("nwave.clipboard")).not.toBeNull();
    press("v", { ctrlKey: true });
    press("x", { ctrlKey: true });
    press("d", { ctrlKey: true });
    press("s", { ctrlKey: true });
    expect(result.current.nodes).toHaveLength(3);
    expect(showToast).toHaveBeenCalledWith(READ_ONLY_EDIT_MESSAGE, "info");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("doesn't change the canvas while a run locks it", () => {
    const { result, rerender, showToast } = setup();
    press("c", { ctrlKey: true });
    rerender({ running: true });
    press("v", { ctrlKey: true });
    press("x", { ctrlKey: true });
    expect(result.current.nodes).toHaveLength(3);
    expect(showToast).toHaveBeenCalledWith("locked", "info");
  });

  it("tells you when there is nothing to paste", () => {
    const { result, showToast } = setup();
    press("v", { ctrlKey: true });
    expect(result.current.nodes).toHaveLength(3);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("Nothing to paste"), "info");
  });

  it("leaves keys alone in text fields, dialogs and selected text", () => {
    const { result, onFitView } = setup();
    const input = document.createElement("input");
    document.body.append(input);
    press("a", { ctrlKey: true }, input);
    press("f", {}, input);
    input.remove();
    expect(result.current.nodes.filter((n) => n.selected)).toHaveLength(2);
    expect(onFitView).not.toHaveBeenCalled();

    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    press("d", { ctrlKey: true });
    dialog.remove();
    expect(result.current.nodes).toHaveLength(3);

    const text = document.createElement("p");
    text.textContent = "log line";
    document.body.append(text);
    window.getSelection()?.selectAllChildren(text);
    press("c", { ctrlKey: true });
    text.remove();
    expect(localStorage.getItem("nwave.clipboard")).toBeNull();
  });
});
