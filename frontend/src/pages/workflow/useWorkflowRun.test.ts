import type { Edge, Node } from "@xyflow/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import { flush, renderHook } from "../../test/renderHook";
import { DEFAULT_EXECUTION_SETTINGS } from "./executionSettings";

type PostConfig = {
  onDownloadProgress?: (event: { event: { target: { responseText: string } } }) => void;
};
const post = vi.fn<(url: string, body: unknown, config?: PostConfig) => Promise<unknown>>();
vi.mock("../../api", () => ({
  default: { post: (url: string, body: unknown, config?: PostConfig) => post(url, body, config) },
  isDemoMode: false,
}));

const listRuns = vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []);
const readRunLogFrom = vi.fn();
vi.mock("../../api/runs", () => ({
  listRuns: (...args: unknown[]) => listRuns(...args),
  readRunLogFrom: (...args: unknown[]) => readRunLogFrom(...args),
}));

const { useWorkflowRun } = await import("./useWorkflowRun");

const unreachable = () => Object.assign(new Error("Network Error"), { isAxiosError: true });

/** A run whose output streams in two parts, then ends. */
const streamedRun = (output: string) =>
  post.mockImplementationOnce(async (_url, _body, config) => {
    const half = output.slice(0, output.indexOf("\n") + 1);
    config?.onDownloadProgress?.({ event: { target: { responseText: half } } });
    return { data: output };
  });

const fileInput = {
  id: "in",
  type: "fileInput",
  position: { x: 0, y: 0 },
  data: { label: "Reads" },
} as Node<NodeData>;

describe("useWorkflowRun", () => {
  const options = {
    nodes: [] as Node<NodeData>[],
    edges: [] as Edge[],
    workflowId: "wf1",
    workflowName: "Run me",
    rawSource: "workflow { println 'hi' }",
    sourceFormat: "nextflow" as const,
    setExecutionSettings: vi.fn(),
    updateNodeData: vi.fn(),
    showToast: vi.fn(),
  };
  let hook: ReturnType<typeof renderHook<typeof options, ReturnType<typeof useWorkflowRun>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    listRuns.mockResolvedValue([]);
    hook = renderHook((props) => useWorkflowRun(props), { initialProps: options });
  });
  afterEach(() => hook.unmount());

  it("streams a successful run and keeps its id and log", async () => {
    streamedRun("N-WAVE run: bee_1\nexecutor > local (1)\nDone\n");
    await hook.result.current.run(DEFAULT_EXECUTION_SETTINGS);
    await flush();

    expect(post).toHaveBeenCalledWith(
      "/execute/execute",
      expect.objectContaining({
        nextflowScript: "workflow { println 'hi' }",
        workflowId: "wf1",
      }),
      expect.objectContaining({ responseType: "text", timeout: 0 }),
    );
    const run = hook.result.current;
    expect(run.isRunning).toBe(false);
    expect(run.lastRunId).toBe("bee_1");
    expect(run.output).toContain("Done");
    expect(run.error).toBeNull();
    expect(options.setExecutionSettings).toHaveBeenCalledWith(DEFAULT_EXECUTION_SETTINGS);
    expect(options.showToast).toHaveBeenCalledWith(
      expect.stringContaining("executed successfully"),
      "success",
    );
  });

  it("shows the error notice for a failed run, with its log", async () => {
    streamedRun("N-WAVE run: bee_2\nERROR ~ boom\n");
    await hook.result.current.run(DEFAULT_EXECUTION_SETTINGS);
    await flush();
    // The notice says it; no toast repeats it.
    expect(options.showToast).not.toHaveBeenCalled();
    expect(hook.result.current.error).toEqual({
      message: "Workflow execution failed",
      output: "N-WAVE run: bee_2\nERROR ~ boom\n",
    });
    expect(hook.result.current.executionStatus.status.isRunning).toBe(false);

    // A later successful run closes it.
    streamedRun("N-WAVE run: bee_3\nDone\n");
    await hook.result.current.run(DEFAULT_EXECUTION_SETTINGS);
    await flush();
    expect(hook.result.current.error).toBeNull();
  });

  it("names a resource problem in the error notice", async () => {
    streamedRun(
      "N-WAVE run: bee_4\nN-WAVE resource problem: A task needed 8 GB of memory.\n",
    );
    await hook.result.current.run(DEFAULT_EXECUTION_SETTINGS);
    await flush();
    expect(hook.result.current.error?.message).toBe(
      "The run hit its resource limits. A task needed 8 GB of memory.",
    );
  });

  it("shows the error notice when the run can't start", async () => {
    post.mockRejectedValueOnce({
      response: {
        status: 500,
        data: { error: "Docker is not running", runId: "bee_3", stdout: "partial" },
      },
    });
    await hook.result.current.run(DEFAULT_EXECUTION_SETTINGS);
    await flush();
    const run = hook.result.current;
    expect(run.error).toMatchObject({
      message: "Docker is not running",
      output: "partial",
      code: 500,
    });
    expect(run.lastRunId).toBe("bee_3");
    expect(run.output).toContain("Error: Docker is not running");

    run.showLog();
    await flush();
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.panelTab).toBe("log");
  });

  it("waits for N-WAVE when the connection drops, then shows how the run ended", async () => {
    vi.useFakeTimers();
    try {
      post.mockImplementationOnce(async (_url, _body, config) => {
        config?.onDownloadProgress?.({ event: { target: { responseText: "N-WAVE run: bee_5\n" } } });
        throw unreachable();
      });
      // N-WAVE restarts: it doesn't answer once, then the run's log says
      // it stopped it.
      readRunLogFrom.mockRejectedValueOnce(unreachable());
      const shutdown =
        "N-WAVE run: bee_5\nN-WAVE: the run was stopped because N-WAVE shut down. Resume it to reuse the steps it finished.\n";
      readRunLogFrom.mockResolvedValueOnce({ text: shutdown, end: 120, live: false });
      listRuns.mockResolvedValue([{ id: "bee_5", status: "cancelled", startedAt: "" }]);

      await hook.result.current.run(DEFAULT_EXECUTION_SETTINGS);
      await flush();
      expect(hook.result.current.isRunning).toBe(true);
      expect(hook.result.current.canCancel).toBe(true);
      await act(() => vi.advanceTimersByTimeAsync(500));
      expect(hook.result.current.output).toContain("Waiting for it");
      expect(hook.result.current.error).toBeNull();

      await act(() => vi.advanceTimersByTimeAsync(3500));
      await flush();
      const run = hook.result.current;
      expect(run.isRunning).toBe(false);
      expect(run.lastRunId).toBe("bee_5");
      expect(run.output).toBe(shutdown);
      expect(run.error?.message).toBe(
        "The run was stopped because N-WAVE shut down. Resume it to reuse the steps it finished.",
      );
      // The run wasn't started again.
      expect(post).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("follows a run that goes on when the workflow is opened", async () => {
    hook.unmount();
    vi.useFakeTimers();
    try {
      listRuns.mockResolvedValue([{ id: "bee_6", status: "running", startedAt: "" }]);
      readRunLogFrom
        .mockResolvedValueOnce({ text: "N-WAVE run: bee_6\n", end: 18, live: true })
        .mockResolvedValueOnce({ text: "Done\n", end: 23, live: false });
      hook = renderHook((props) => useWorkflowRun(props), { initialProps: options });
      await flush();
      expect(hook.result.current.isRunning).toBe(true);
      expect(hook.result.current.canCancel).toBe(true);
      expect(readRunLogFrom).toHaveBeenCalledWith("bee_6", 0);

      listRuns.mockResolvedValue([{ id: "bee_6", status: "succeeded", startedAt: "" }]);
      await act(() => vi.advanceTimersByTimeAsync(1500));
      await flush();
      expect(readRunLogFrom).toHaveBeenLastCalledWith("bee_6", 18);
      expect(hook.result.current.isRunning).toBe(false);
      expect(hook.result.current.output).toBe("N-WAVE run: bee_6\nDone\n");
      expect(options.showToast).toHaveBeenCalledWith(
        expect.stringContaining("executed successfully"),
        "success",
      );
      expect(post).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't start a run with an empty, connected File Input", async () => {
    hook.rerender({
      ...options,
      nodes: [fileInput],
      edges: [{ id: "e", source: "in", target: "x" }],
    });
    await hook.result.current.run(DEFAULT_EXECUTION_SETTINGS);
    await flush();
    expect(post).not.toHaveBeenCalled();
    expect(hook.result.current.error?.message).toBe(
      'Add a file to "Reads" before running the workflow.',
    );
  });
});
