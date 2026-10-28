import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn(async () => ({ data: {} }));
vi.mock("../../api", () => ({
  default: { post: (...args: unknown[]) => post(...(args as [])) },
}));

const { useExecutionStatus } = await import("./useExecutionStatus");

const setup = (executionId: string | null = "run-1") => {
  const onStatusChange = vi.fn();
  const hook = renderHook(() =>
    useExecutionStatus({ nodes: [], executionId, onStatusChange }),
  );
  return { ...hook, onStatusChange };
};

describe("useExecutionStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    post.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts empty and shows the panel when a run starts", () => {
    const { result } = setup();
    expect(result.current.status.isRunning).toBe(false);
    expect(result.current.isVisible).toBe(false);
    act(() => result.current.startExecution());
    expect(result.current.status).toMatchObject({
      isRunning: true,
      totalNodes: 0,
      currentStage: "Starting workflow execution...",
    });
    expect(result.current.isVisible).toBe(true);
  });

  it("counts all of the run's processes, the ones Nextflow hides too", () => {
    const { result } = setup();
    act(() => result.current.startExecution());
    const feed = (lines: string[]) =>
      act(() => result.current.parseNextflowOutput(lines.join("\n")));

    // Before any task: every process waits.
    feed([
      "[-        ] NFCORE_ATACSEQ:ATACSEQ:FASTQC -",
      "[-        ] NFCORE_ATACSEQ:ATACSEQ:TRIMGALORE -",
    ]);
    expect(result.current.status).toMatchObject({
      totalProcesses: 2,
      finishedProcesses: 0,
    });

    feed([
      "executor >  local (6)",
      "[ab/cd1234] NFCORE_ATACSEQ:ATACSEQ:FASTQC (s1) | 2 of 2 ✔",
      "[ef/012345] NFCORE_ATACSEQ:ATACSEQ:TRIMGALORE (s1) | 1 of 2",
      "[-        ] NFCORE_ATACSEQ:ATACSEQ:BWA_MEM -",
      // With colours, as some terminals get it.
      "\u001b[3mPlus \u001b[1m38\u001b[0m\u001b[3m more processes waiting for tasks…\u001b[0m",
    ]);
    expect(result.current.status).toMatchObject({
      totalProcesses: 41,
      finishedProcesses: 1,
    });

    // The next snapshot, read halfway, doesn't lower the counts.
    feed([
      "executor >  local (7)",
      "[ab/cd1234] NFCORE_ATACSEQ:ATACSEQ:FASTQC (s1) | 2 of 2 ✔",
    ]);
    expect(result.current.status).toMatchObject({
      totalProcesses: 41,
      finishedProcesses: 1,
    });
    // A snapshot without "executor >" in front starts at a repeated name.
    feed([
      "[ef/012345] NFCORE_ATACSEQ:ATACSEQ:TRIMGALORE (s2) | 2 of 2 ✔",
      "[ab/cd1234] NFCORE_ATACSEQ:ATACSEQ:FASTQC (s1) | 2 of 2 ✔",
      "[ef/012345] NFCORE_ATACSEQ:ATACSEQ:TRIMGALORE (s2) | 2 of 2 ✔",
      "Plus 38 more processes waiting for tasks…",
    ]);
    expect(result.current.status).toMatchObject({
      totalProcesses: 41,
      finishedProcesses: 2,
    });
  });

  it("reads lines whose task hash is a link to its work directory", () => {
    // Newer Nextflow versions print the hash as an OSC 8 link.
    const link = (hash: string) =>
      `\u001b[2m[\u001b[0m\u001b[34m\u001b]8;;file:///results/work/${hash}0000\u0007${hash}\u001b]8;;\u0007\u001b[0m\u001b[2m]\u001b[0m`;
    const { result } = setup();
    act(() => result.current.startExecution());
    act(() =>
      result.current.parseNextflowOutput(
        [
          "executor >  local (5)",
          `${link("72/6ebddb")} NFC…AW_DATA_FILES (sampleID_2) | 4 of 4, cached: 4 ✔`,
          `${link("57/a60080")} NFC…PLISEQ:FASTQC (sampleID_2) | 1 of 4`,
          "Plus 3 more processes waiting for tasks…",
        ].join("\n"),
      ),
    );
    expect(result.current.status).toMatchObject({
      totalProcesses: 5,
      finishedProcesses: 1,
      totalNodes: 2,
      completedNodes: 1,
      runningNodes: 1,
    });
  });

  it("tracks processes from Nextflow's console lines", () => {
    const { result } = setup();
    act(() => result.current.startExecution());
    act(() =>
      result.current.parseNextflowOutput(
        [
          "N E X T F L O W  ~  version 25.10.4",
          "Launching `main.nf` [sad_euler] DSL2 - revision: 1234",
          "executor >  local (2)",
          "[ab/cd1234] filter_node_1 (1) | 1 of 1 ✔",
          "[ef/012345] SAMTOOLS_SORT | 0 of 2",
        ].join("\n"),
      ),
    );
    const { status } = result.current;
    expect(status.totalNodes).toBe(2);
    expect(status.completedNodes).toBe(1);
    expect(status.runningNodes).toBe(1);
    expect(status.overallProgress).toBe(50);
    expect(
      status.nodeStatuses.map((node) => [
        node.nodeId,
        node.nodeName,
        node.status,
        node.progress,
      ]),
    ).toEqual([
      ["filter_node_1", "Filter", "success", 100],
      ["SAMTOOLS_SORT", "SAMTOOLS_SORT", "running", 0],
    ]);
    expect(status.currentStage).toBe("SAMTOOLS_SORT: 0/2");

    act(() =>
      result.current.parseNextflowOutput(
        "[ef/012345] SAMTOOLS_SORT | 2 of 2 ✔",
      ),
    );
    expect(result.current.status.nodeStatuses[1]).toMatchObject({
      status: "success",
      progress: 100,
    });
    expect(result.current.status.completedNodes).toBe(2);
  });

  // Lines from a real run (Nextflow 25.10) where one task of BAD_STEP fails.
  it("marks a process that failed as an error", () => {
    const { result } = setup();
    act(() => result.current.startExecution());
    act(() =>
      result.current.parseNextflowOutput(
        [
          "executor >  local (4)",
          "[3f/fb716d] OK_STEP (2)  | 0 of 2",
          "[86/f75e3e] BAD_STEP (1) | 0 of 2",
          "[0e/d170c1] OK_STEP (1)  | 2 of 2 ✔",
          "[86/f75e3e] BAD_STEP (1) | 0 of 2 ✘",
        ].join("\n"),
      ),
    );
    expect(
      result.current.status.nodeStatuses.map((node) => [
        node.nodeId,
        node.status,
      ]),
    ).toEqual([
      ["OK_STEP", "success"],
      ["BAD_STEP", "error"],
    ]);
    expect(result.current.status.failedNodes).toBe(1);
    expect(result.current.status.nodeStatuses[1].endTime).toBeInstanceOf(Date);
  });

  it("reads counts with Nextflow's failed and cached notes", () => {
    const { result } = setup();
    act(() => result.current.startExecution());
    act(() =>
      result.current.parseNextflowOutput(
        "[ab/cd1234] ALIGN (3) | 3 of 3, cached: 1 ✔",
      ),
    );
    expect(result.current.status.nodeStatuses[0]).toMatchObject({
      nodeId: "ALIGN",
      status: "success",
      progress: 100,
    });
    act(() =>
      result.current.parseNextflowOutput(
        "[ef/012345] SORT (1) | 1 of 2, failed: 1 ✘",
      ),
    );
    expect(result.current.status.nodeStatuses[1]).toMatchObject({
      nodeId: "SORT",
      status: "error",
      progress: 50,
    });
  });

  it("reads the launch, executor and error lines into the stage", () => {
    const { result } = setup();
    act(() => result.current.startExecution());
    act(() =>
      result.current.parseNextflowOutput(
        "Launching `main.nf` [sad_euler] DSL2 - revision: 1234",
      ),
    );
    expect(result.current.status.currentStage).toBe(
      "Started: main.nf [sad_euler]",
    );
    act(() => result.current.parseNextflowOutput("executor >  local (3)"));
    expect(result.current.status.currentStage).toBe(
      "Executor: local (3 processes running)",
    );
    act(() =>
      result.current.parseNextflowOutput(
        "ERROR ~ Error executing process > 'FASTQC'",
      ),
    );
    expect(result.current.status.currentStage).toBe(
      "Error: Error executing process > 'FASTQC'",
    );
  });

  it("finishes the run when the backend says it completed, and marks running processes done", () => {
    const { result } = setup();
    act(() => result.current.startExecution());
    act(() =>
      result.current.parseNextflowOutput("[ab/cd1234] map_node_1 | 0 of 1"),
    );
    act(() =>
      result.current.parseNextflowOutput("Nextflow execution completed successfully"),
    );
    expect(result.current.status).toMatchObject({
      isRunning: false,
      overallProgress: 100,
    });
    expect(result.current.status.nodeStatuses[0]).toMatchObject({
      status: "success",
      progress: 100,
    });
  });

  it("keeps running when a task prints what looks like Nextflow's summary", () => {
    const { result } = setup();
    act(() => result.current.startExecution());
    act(() =>
      result.current.parseNextflowOutput("[ab/cd1234] map_node_1 | 0 of 1"),
    );
    // A process with `debug true` printing its own timing.
    for (const line of ["Duration: 3.2s", "Succeeded: 12", "Completed at: noon", "CPU hours: 0.1"]) {
      act(() => result.current.parseNextflowOutput(line));
    }
    expect(result.current.status.isRunning).toBe(true);
    expect(result.current.status.nodeStatuses[0]?.status).not.toBe("success");
  });

  it("stops on a failure line", () => {
    const { result } = setup();
    act(() => result.current.startExecution());
    act(() =>
      result.current.parseNextflowOutput(
        "Nextflow execution failed with exit code 1",
      ),
    );
    expect(result.current.status).toMatchObject({
      isRunning: false,
      currentStage: "Nextflow execution failed with exit code 1",
    });
  });

  it("completes a failed run with the error on unfinished processes, then clears the canvas", () => {
    const { result, onStatusChange } = setup();
    act(() => result.current.startExecution());
    act(() =>
      result.current.parseNextflowOutput("[ab/cd1234] map_node_1 | 0 of 1"),
    );
    act(() => result.current.completeExecution(false, "Out of memory"));
    expect(result.current.status).toMatchObject({
      isRunning: false,
      failedNodes: 1,
      currentStage: "Workflow failed",
    });
    expect(result.current.status.nodeStatuses[0]).toMatchObject({
      status: "error",
      error: "Out of memory",
    });
    onStatusChange.mockClear();
    act(() => vi.advanceTimersByTime(10_000));
    expect(onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ nodeStatuses: [] }),
    );
  });

  it("cancels the run on the server", async () => {
    const { result } = setup("run-7");
    act(() => result.current.startExecution());
    await act(() => result.current.cancelExecution());
    expect(post).toHaveBeenCalledWith("/execute/cancel", {
      executionId: "run-7",
    });
    expect(result.current.status).toMatchObject({
      isRunning: false,
      currentStage: "Workflow cancelled",
      overallProgress: 0,
    });
  });

  it("doesn't cancel without a run ID", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = setup(null);
    await act(() => result.current.cancelExecution());
    expect(post).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("hides and shows the panel", () => {
    const { result } = setup();
    act(() => result.current.showStatus());
    expect(result.current.isVisible).toBe(true);
    act(() => result.current.hideStatus());
    expect(result.current.isVisible).toBe(false);
  });
});
