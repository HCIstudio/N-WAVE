import type { EdgeChange, NodeChange } from "reactflow";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../../test/renderHook";
import {
  edgeChangesWhileReadOnly,
  edgeChangesWhileRunning,
  nodeChangesWhileReadOnly,
  nodeChangesWhileRunning,
  RUN_LOCK_MESSAGE,
  useEditGuards,
} from "./useEditGuards";

const select: NodeChange = { type: "select", id: "a", selected: true };
const dimensions = {
  type: "dimensions",
  id: "a",
  dimensions: { width: 1, height: 1 },
} as NodeChange;
const drag = {
  type: "position",
  id: "a",
  position: { x: 1, y: 1 },
  dragging: true,
} as NodeChange;
const remove: NodeChange = { type: "remove", id: "a" };

describe("change filters", () => {
  it("only lets selection and measuring through while running", () => {
    expect(nodeChangesWhileRunning([select, dimensions, drag])).toEqual({
      allowed: [select, dimensions],
      blocked: true,
    });
    expect(nodeChangesWhileRunning([select]).blocked).toBe(false);
    const edgeRemove: EdgeChange = { type: "remove", id: "e" };
    expect(edgeChangesWhileRunning([edgeRemove])).toEqual({
      allowed: [],
      blocked: true,
    });
  });

  it("asks for a copy when a read-only workflow is dragged or changed", () => {
    expect(nodeChangesWhileReadOnly([select, drag])).toEqual({
      allowed: [select],
      wantsCopy: true,
    });
    expect(nodeChangesWhileReadOnly([remove]).wantsCopy).toBe(true);
    expect(nodeChangesWhileReadOnly([select]).wantsCopy).toBe(false);
    expect(
      edgeChangesWhileReadOnly([{ type: "remove", id: "e" }]).wantsCopy,
    ).toBe(true);
  });
});

describe("useEditGuards", () => {
  const setup = (state: { isRunning: boolean; readOnly: boolean }) => {
    const props = {
      ...state,
      duplicateReadOnlyWorkflow: vi.fn(async () => true),
      showToast: vi.fn(),
      setIsDirty: vi.fn(),
      onNodesChange: vi.fn(),
      onEdgesChange: vi.fn(),
      onConnect: vi.fn(),
    };
    const { result, unmount } = renderHook(() => useEditGuards(props));
    return { props, guards: result.current, unmount };
  };

  it("blocks edits while a run goes and says why", () => {
    const { props, guards, unmount } = setup({ isRunning: true, readOnly: false });
    expect(guards.canEdit()).toBe(false);
    expect(props.showToast).toHaveBeenCalledWith(RUN_LOCK_MESSAGE, "info");
    guards.handleNodesChange([select, drag]);
    expect(props.onNodesChange).toHaveBeenCalledWith([select]);
    guards.handleConnect({ source: "a", target: "b", sourceHandle: null, targetHandle: null });
    expect(props.onConnect).not.toHaveBeenCalled();
    unmount();
  });

  it("copies a read-only workflow instead of editing it", async () => {
    const { props, guards, unmount } = setup({ isRunning: false, readOnly: true });
    expect(guards.canEdit()).toBe(false);
    expect(props.duplicateReadOnlyWorkflow).toHaveBeenCalledTimes(1);
    expect(await guards.ensureEditable()).toBe(false);
    guards.handleNodesChange([select]);
    expect(props.onNodesChange).toHaveBeenCalledWith([select]);
    // Selecting in a demo isn't an edit to save.
    expect(props.setIsDirty).toHaveBeenCalledWith(false);
    unmount();
  });

  it("passes edits through otherwise", () => {
    const { props, guards, unmount } = setup({ isRunning: false, readOnly: false });
    expect(guards.canEdit()).toBe(true);
    guards.handleNodesChange([drag, remove]);
    expect(props.onNodesChange).toHaveBeenCalledWith([drag, remove]);
    guards.handleConnect({ source: "a", target: "b", sourceHandle: null, targetHandle: null });
    expect(props.onConnect).toHaveBeenCalled();
    expect(props.showToast).not.toHaveBeenCalled();
    unmount();
  });
});
