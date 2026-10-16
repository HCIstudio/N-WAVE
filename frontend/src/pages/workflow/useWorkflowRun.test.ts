import type { Edge, Node } from "reactflow";
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

const { useWorkflowRun } = await import("./useWorkflowRun");

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

  it("tells about a failed run in a toast, not the error notice", async () => {
    streamedRun("N-WAVE run: bee_2\nERROR ~ boom\n");
    await hook.result.current.run(DEFAULT_EXECUTION_SETTINGS);
    await flush();
    expect(options.showToast).toHaveBeenCalledWith(
      expect.stringContaining("execution failed"),
      "error",
    );
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.executionStatus.status.isRunning).toBe(false);
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
