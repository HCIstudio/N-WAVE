import { act, renderHook } from "@testing-library/react";
import type { Node } from "@xyflow/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  recorded,
  startRecording,
  stopRecording,
} from "../activity/activityTesting";
import type { NodeData } from "../components/nodes/BaseNode";
import { importNextflowScript } from "../workflows/import/importScript";
import { useCanvasView } from "./useCanvasView";

const script = import.meta.glob(
  "../workflows/import/fixtures/code-calls-step.nf",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;
const imported = importNextflowScript(Object.values(script)[0]);
const nodes = imported.nodes as Node<NodeData>[];

afterEach(stopRecording);

describe("useCanvasView", () => {
  it("adds the connections made in code as dashed edges and warnings", () => {
    const { result } = renderHook(() =>
      useCanvasView(nodes, imported.edges, "wf"),
    );
    expect(
      result.current.edges.filter((edge) => edge.type === "derived"),
    ).toHaveLength(1);
    expect(result.current.problems.map((problem) => problem.level)).toEqual([
      "warning",
    ]);
    expect(result.current.problems[0].message).toMatch(
      /which the canvas doesn't connect to it/,
    );
  });

  it("shows nothing of it without connection hints", () => {
    const { result } = renderHook(() =>
      useCanvasView(nodes, imported.edges, "wf", {
        showCodeConnections: false,
      }),
    );
    expect(result.current.edges).toEqual(imported.edges);
    expect(result.current.problems).toEqual([]);
  });

  it("switches to a graph view, and back to the editor on an edit (recorded in verbose mode)", () => {
    startRecording();
    const { result, rerender } = renderHook(
      ({ current }) => useCanvasView(current, imported.edges, "wf"),
      {
        initialProps: { current: nodes },
      },
    );
    act(() => result.current.setView("dependencies"));
    expect(result.current.view).toBe("dependencies");
    // Moving nodes isn't an edit.
    rerender({
      current: nodes.map((node) => ({ ...node, position: { x: 1, y: 1 } })),
    });
    expect(result.current.view).toBe("dependencies");
    rerender({
      current: nodes.map((node) => ({
        ...node,
        data: { ...node.data, label: `${node.data.label}!` },
      })),
    });
    expect(result.current.view).toBe("editor");
    expect(recorded("canvas.viewChanged").map((event) => event.data)).toEqual([
      { view: "dependencies" },
    ]);
  });
});
