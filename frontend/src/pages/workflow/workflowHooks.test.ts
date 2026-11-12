import { act } from "react";
import type { Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import { flush, renderHook } from "../../test/renderHook";
import { DEFAULT_EXECUTION_SETTINGS } from "./executionSettings";

const listRunTasks = vi.fn(async (_runId: string) => [] as unknown[]);
vi.mock("../../api/runs", () => ({
  listRunTasks: (runId: string) => listRunTasks(runId),
}));

const { useNodePanels } = await import("./useNodePanels");
const { RUN_TASKS_POLL_MS, useRunTasks } = await import("./useRunTasks");
const { scriptDownload } = await import("./workflowExport");

describe("useNodePanels", () => {
  it("opens, stacks, recenters and closes panels", () => {
    const { result, unmount } = renderHook(useNodePanels);
    act(() => result.current.open("a"));
    act(() => result.current.open("b"));
    expect(result.current.openIds).toEqual(["a", "b"]);
    expect(result.current.zIndexOf("b")).toBeGreaterThan(result.current.zIndexOf("a"));
    expect(result.current.highlightedId).toBe("b");
    expect(result.current.recenterTriggerOf("a")).toBeUndefined();

    // Opening an open panel brings it to the front and back into view.
    act(() => result.current.open("a"));
    expect(result.current.zIndexOf("a")).toBeGreaterThan(result.current.zIndexOf("b"));
    expect(result.current.recenterTriggerOf("a")).toEqual(expect.any(Number));
    expect(result.current.openIds).toEqual(["a", "b"]);

    act(() => result.current.close("a"));
    expect(result.current.openIds).toEqual(["b"]);
    expect(result.current.highlightedId).toBeNull();
    unmount();
  });
});

describe("useRunTasks", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls a run's tasks while it goes and once more when it ends", async () => {
    const { rerender, unmount } = renderHook(
      (props: { runId: string | null; isRunning: boolean }) =>
        useRunTasks(props.runId, props.isRunning, [] as Node<NodeData>[]),
      { initialProps: { runId: null, isRunning: true } },
    );
    expect(listRunTasks).not.toHaveBeenCalled();
    rerender({ runId: "bee_1", isRunning: true });
    await flush();
    expect(listRunTasks).toHaveBeenCalledTimes(1);
    // Each poll waits for the last answer, so step one interval at a time.
    for (let poll = 0; poll < 2; poll += 1) {
      await act(async () => {
        vi.advanceTimersByTime(RUN_TASKS_POLL_MS);
      });
    }
    expect(listRunTasks).toHaveBeenCalledTimes(3);
    rerender({ runId: "bee_1", isRunning: false });
    await flush();
    expect(listRunTasks).toHaveBeenCalledTimes(4);
    await act(async () => {
      vi.advanceTimersByTime(RUN_TASKS_POLL_MS * 2);
    });
    expect(listRunTasks).toHaveBeenCalledTimes(4);
    unmount();
  });
});

describe("scriptDownload", () => {
  const source = {
    nodes: [] as Node<NodeData>[],
    edges: [],
    workflowName: "My flow",
    settings: DEFAULT_EXECUTION_SETTINGS,
    rawSource: null as string | null,
    sourceFormat: "visual" as const,
  };

  it("names the file after the workflow and generates the script", () => {
    const download = scriptDownload(source);
    expect(download.fileName).toBe("My_flow.nf");
    expect(download.content).toContain("params.outdir = 'results'");
  });

  it("keeps an imported workflow's own source while it has no nodes", () => {
    expect(
      scriptDownload({
        ...source,
        rawSource: "workflow { }",
        sourceFormat: "nextflow" as never,
      }).content,
    ).toBe("workflow { }");
  });
});
