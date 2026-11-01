import type { Edge, Node } from "@xyflow/react";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import star from "../../demo/rnaseqStarSalmonExample.json";
import { registerNfCoreNodes } from "../../../scripts/lint/fixtures";
import { recorded, startRecording, stopRecording } from "../../activity/activityTesting";
import { renderHook } from "../../test/renderHook";
import { ACTIVITY_SETTLE_MS, changedKeys, useCanvasActivity } from "./useCanvasActivity";

vi.mock("../../api", () => ({ default: { post: vi.fn(async () => ({ data: {} })) }, isDemoMode: false }));

const exampleNodes = (star as unknown as { nodes: Node<NodeData>[] }).nodes;
beforeAll(() => registerNfCoreNodes(exampleNodes));
const example = (id: string): Node<NodeData> => {
  const found = exampleNodes.find((node) => node.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
};

const node = (id: string, data: Partial<NodeData> = {}, x = 0): Node<NodeData> => ({
  id,
  type: "process",
  position: { x, y: 0 },
  data: { label: id.toUpperCase(), ...data } as NodeData,
});

type Props = { nodes: Node<NodeData>[]; edges: Edge[]; isLoading?: boolean; workflowId?: string };
const show = (initial: Props) =>
  renderHook(
    ({ nodes, edges, isLoading = false, workflowId = "wf-1" }: Props) =>
      useCanvasActivity({ workflowId, nodes, edges, isLoading }),
    { initialProps: initial },
  );

describe("useCanvasActivity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    startRecording();
  });
  afterEach(() => {
    stopRecording();
    vi.useRealTimers();
  });

  it("records the workflow as opened once it has loaded, not its nodes as added", () => {
    const view = show({ nodes: [], edges: [], isLoading: true });
    view.rerender({ nodes: [node("a"), node("b")], edges: [], isLoading: true });
    view.rerender({ nodes: [node("a"), node("b")], edges: [], isLoading: false });
    expect(recorded().map((event) => [event.type, event.data, event.workflowId])).toEqual([
      ["workflow.opened", { nodes: 2, edges: 0 }, "wf-1"],
    ]);
    view.unmount();
  });

  it("records nodes added and removed, once each", () => {
    const view = show({ nodes: [node("a")], edges: [] });
    view.rerender({ nodes: [node("a"), node("b")], edges: [] });
    view.rerender({ nodes: [node("b")], edges: [] });
    expect(recorded().slice(1).map((event) => [event.type, event.data])).toEqual([
      ["node.added", { nodeId: "b", nodeType: "process", label: "B" }],
      ["node.removed", { nodeId: "a", nodeType: "process", label: "A" }],
    ]);
    view.unmount();
  });

  it("records a drag as one move, once it settles", () => {
    const a = node("a");
    const view = show({ nodes: [a], edges: [] });
    for (const x of [5, 20, 60]) {
      view.rerender({ nodes: [{ ...a, position: { x, y: 0 }, dragging: true }], edges: [] });
    }
    view.rerender({ nodes: [{ ...a, position: { x: 80, y: 0 }, dragging: false }], edges: [] });
    expect(recorded("node.moved")).toEqual([]);
    act(() => vi.advanceTimersByTime(ACTIVITY_SETTLE_MS));
    expect(recorded("node.moved").map((event) => event.data)).toEqual([{ nodeIds: ["a"] }]);
    view.unmount();
  });

  it("records typing into a node's settings as one change, with the keys but not the values", () => {
    const a = node("a");
    const view = show({ nodes: [a], edges: [] });
    for (const label of ["F", "Fa", "Fas"]) {
      view.rerender({ nodes: [{ ...a, data: { ...a.data, label, _refreshTimestamp: Date.now() } }], edges: [] });
    }
    act(() => vi.advanceTimersByTime(ACTIVITY_SETTLE_MS));
    expect(recorded("node.configured").map((event) => event.data)).toEqual([
      { nodeId: "a", nodeType: "process", label: "Fas", keys: ["label"] },
    ]);
    view.unmount();
  });

  it("records the values too when the installation turns that on", () => {
    startRecording({}, true);
    const a = node("a");
    const view = show({ nodes: [a], edges: [] });
    view.rerender({ nodes: [{ ...a, data: { ...a.data, threshold: 5 } as NodeData }], edges: [] });
    act(() => vi.advanceTimersByTime(ACTIVITY_SETTLE_MS));
    expect(recorded("node.configured")[0].data).toMatchObject({ keys: ["threshold"], values: { threshold: 5 } });
    view.unmount();
  });

  it("records connections made, with the hint when the ports don't fit, and removed", () => {
    const samples = example("samples");
    const index = example("star_index");
    const edge: Edge = { id: "e1", source: "samples", sourceHandle: "samples", target: "star_index", targetHandle: "fasta" };
    const view = show({ nodes: [samples, index], edges: [] });
    view.rerender({ nodes: [samples, index], edges: [edge] });
    view.rerender({ nodes: [samples, index], edges: [] });
    const [made] = recorded("connection.made");
    expect(made.data).toMatchObject({
      edgeId: "e1",
      source: "samples",
      sourceHandle: "samples",
      target: "star_index",
      targetHandle: "fasta",
    });
    expect(String(made.data?.hint)).toMatch(/expects/);
    expect(recorded("connection.removed").map((event) => event.data?.edgeId)).toEqual(["e1"]);
    view.unmount();
  });

  it("records nothing while verbose mode is off", () => {
    startRecording({ verbose: false });
    const view = show({ nodes: [node("a")], edges: [] });
    view.rerender({ nodes: [node("a", {}, 50), node("b")], edges: [] });
    act(() => vi.advanceTimersByTime(ACTIVITY_SETTLE_MS));
    expect(recorded()).toEqual([]);
    view.unmount();
  });

  it("compares settings, not what a node records about itself", () => {
    expect(
      changedKeys({ label: "A", _refreshTimestamp: 1, pipelineLastRun: { id: "r1" } } as unknown as NodeData, {
        label: "A",
        _refreshTimestamp: 2,
        pipelineLastRun: { id: "r2" },
        onChange: () => {},
      } as unknown as NodeData),
    ).toEqual([]);
  });
});
