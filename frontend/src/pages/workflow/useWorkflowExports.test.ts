import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowSource } from "./workflowExport";

const exportProject = vi.fn();
const downloadScript = vi.fn();
vi.mock("./workflowExport", async (original) => ({
  ...(await original<typeof import("./workflowExport")>()),
  exportProject: (...args: unknown[]) => exportProject(...args),
  downloadScript: (...args: unknown[]) => downloadScript(...args),
}));

const { useWorkflowExports } = await import("./useWorkflowExports");

const source = { nodes: [], edges: [], workflowName: "QC" } as unknown as WorkflowSource;

describe("useWorkflowExports", () => {
  it("says what a project export made, and is busy meanwhile", async () => {
    let finish: (name: string) => void = () => {};
    exportProject.mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));
    const showToast = vi.fn();
    const { result } = renderHook(() => useWorkflowExports(source, null, showToast));

    let done: Promise<void> | undefined;
    act(() => {
      done = result.current.exports.onExportProject?.() as Promise<void>;
    });
    expect(result.current.isExporting).toBe(true);
    await act(async () => {
      finish("QC.zip");
      await done;
    });
    expect(result.current.isExporting).toBe(false);
    expect(showToast).toHaveBeenCalledWith("Exported QC.zip. Unzip it and see README.md for how to run it.", "success");
  });

  it("says why an export failed", async () => {
    downloadScript.mockImplementation(() => {
      throw new Error("The workflow has a cycle.");
    });
    const showToast = vi.fn();
    const { result } = renderHook(() => useWorkflowExports(source, null, showToast));
    await act(async () => result.current.exports.onDownload());
    expect(showToast).toHaveBeenCalledWith("The workflow has a cycle.", "error");
  });

  it("offers the canvas's views without an analysis", () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useWorkflowExports(source, null, showToast));
    expect(result.current.exports.diagramSources?.map((entry) => entry.id)).toEqual(["canvas", "process-graph"]);
  });
});
