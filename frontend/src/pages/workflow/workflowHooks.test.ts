import { act } from "react";
import type { Node } from "reactflow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import { flush, renderHook } from "../../test/renderHook";
import { DEFAULT_EXECUTION_SETTINGS } from "./executionSettings";

const listRunTasks = vi.fn(async (_runId: string) => [] as unknown[]);
vi.mock("../../api/runs", () => ({
  listRunTasks: (runId: string) => listRunTasks(runId),
}));
const apiDelete = vi.fn(async () => ({}));
vi.mock("../../api", () => ({
  default: { delete: (...args: unknown[]) => apiDelete(...(args as [])) },
  isDemoMode: false,
}));
const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

const { useNodePanels } = await import("./useNodePanels");
const { RUN_TASKS_POLL_MS, useRunTasks } = await import("./useRunTasks");
const { tutorialSteps, useWorkflowTutorial } = await import(
  "./useWorkflowTutorial"
);
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
    await act(async () => {
      vi.advanceTimersByTime(RUN_TASKS_POLL_MS * 2);
    });
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

describe("useWorkflowTutorial", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.clearAllMocks();
  });

  const start = (step: number, readOnly: boolean) => {
    sessionStorage.setItem("nwave.demoTutorial.active", "true");
    sessionStorage.setItem("nwave.demoTutorial.step", String(step));
    const duplicateReadOnlyWorkflow = vi.fn(
      async (options?: { onCopied?: (id: string) => void }) => {
        options?.onCopied?.("copy1");
        return true;
      },
    );
    const hook = renderHook(useWorkflowTutorial, {
      initialProps: {
        workflowId: "copy1",
        readOnly,
        duplicateReadOnlyWorkflow,
        showError: vi.fn(),
      },
    });
    return { ...hook, duplicateReadOnlyWorkflow };
  };

  it("resumes where the user was and steps through", () => {
    const { result, unmount } = start(1, false);
    expect(result.current.stepIndex).toBe(1);
    act(() => result.current.forward());
    expect(result.current.stepIndex).toBe(2);
    expect(sessionStorage.getItem("nwave.demoTutorial.step")).toBe("2");
    act(() => result.current.back());
    expect(result.current.stepIndex).toBe(1);
    unmount();
  });

  it("continues the add-node step in a copy of a read-only demo", async () => {
    const { result, duplicateReadOnlyWorkflow, unmount } = start(4, true);
    let tookOver = false;
    act(() => {
      tookOver = result.current.onAddNode();
    });
    await flush();
    expect(tookOver).toBe(true);
    expect(result.current.stepIndex).toBe(5);
    expect(duplicateReadOnlyWorkflow).toHaveBeenCalled();
    expect(sessionStorage.getItem("nwave.demoTutorial.copyId")).toBe("copy1");
    unmount();
  });

  it("lets the node be added in an editable workflow", () => {
    const { result, unmount } = start(4, false);
    let tookOver = true;
    act(() => {
      tookOver = result.current.onAddNode();
    });
    expect(tookOver).toBe(false);
    expect(result.current.stepIndex).toBe(5);
    unmount();
  });

  it("finishes by removing its copy and leaving it", async () => {
    sessionStorage.setItem("nwave.demoTutorial.copyId", "copy1");
    const { result, unmount } = start(tutorialSteps.length - 1, false);
    await act(async () => {
      await result.current.finish();
    });
    expect(result.current.stepIndex).toBeNull();
    expect(localStorage.getItem("nwave.demoTutorial.completed")).toBeTruthy();
    expect(apiDelete).toHaveBeenCalledWith("/workflows/copy1");
    expect(navigate).toHaveBeenCalledWith("/");
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
