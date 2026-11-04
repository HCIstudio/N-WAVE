import { act, renderHook, waitFor } from "@testing-library/react";
import type { Node } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NodeData } from "../components/nodes/BaseNode";

const post = vi.fn();
vi.mock("../api", () => ({ default: { post: (...args: unknown[]) => post(...args) }, isDemoMode: false }));

const { recorded, startRecording, stopRecording } = await import("../activity/activityTesting");
const { importNextflowScript } = await import("../workflows/import/importScript");
const { useWorkflowAnalysis } = await import("./useWorkflowAnalysis");

afterEach(() => {
  stopRecording();
  post.mockReset();
});

const imported = importNextflowScript(
  ["process QC {", "    script:", '    "echo ${missing}"', "}", "", "workflow {", "    QC()", "}", ""].join("\n"),
);

describe("useWorkflowAnalysis", () => {
  it("analyses the generated script, and its problems last while the code stays the same", async () => {
    startRecording();
    post.mockImplementation(async (_path: string, body: { nextflowScript: string }) => {
      const line = body.nextflowScript.split("\n").findIndex((text) => text.includes("missing")) + 1;
      return {
        data: {
          lint: {
            status: "done",
            result: { tool: { name: "nextflow lint", image: "x" }, files: ["main.nf"], problems: [{ level: "error", file: "main.nf", line, column: 12, message: "`missing` is not defined" }] },
          },
          bioflow: { status: "unavailable", reason: "off" },
        },
      };
    });
    const { result, rerender } = renderHook(({ nodes }) => useWorkflowAnalysis(nodes, imported.edges, "wf"), {
      initialProps: { nodes: imported.nodes as Node<NodeData>[] },
    });
    await act(() => result.current.analyse());
    expect(post).toHaveBeenCalledWith("/analysis", expect.objectContaining({ nextflowScript: expect.stringContaining("process QC") }), expect.anything());
    const qc = imported.nodes.find((node) => node.data.label === "QC")?.id;
    expect(result.current.current).toBe(true);
    expect(result.current.problems).toEqual([expect.objectContaining({ nodeId: qc, level: "error", advisory: true })]);
    expect(recorded("analysis.run").map((event) => event.data)).toEqual([{ lint: "done", bioflow: "unavailable", errors: 1, warnings: 0 }]);

    // Moved: still current. Changed: the problems go until it's analysed again.
    rerender({ nodes: imported.nodes.map((node) => ({ ...node, position: { x: 5, y: 5 } })) as Node<NodeData>[] });
    expect(result.current.problems).toHaveLength(1);
    rerender({ nodes: imported.nodes.map((node) => ({ ...node, data: { ...node.data, label: `${node.data.label} 2` } })) as Node<NodeData>[] });
    await waitFor(() => expect(result.current.current).toBe(false));
    expect(result.current.problems).toEqual([]);
  });

  it("says when the request fails", async () => {
    post.mockRejectedValue(Object.assign(new Error("x"), { response: { status: 500, data: { message: "nf-core module \"x\" is not installed" } } }));
    const { result } = renderHook(() => useWorkflowAnalysis(imported.nodes as Node<NodeData>[], imported.edges, "wf"));
    await act(() => result.current.analyse());
    expect(result.current.error).toContain("is not installed");
    expect(result.current.running).toBe(false);
  });
});
