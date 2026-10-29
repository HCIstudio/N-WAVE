import { act } from "react";
import type { Edge, Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import { flush, renderHook } from "../../test/renderHook";
import { defaultExecutionSettings } from "../../workflows/defaultExecutionSettings";
import type { WorkflowProblem } from "./workflowCheck";

const get = vi.fn();
vi.mock("../../api", () => ({
  default: { get: (...args: unknown[]) => get(...args) },
  isDemoMode: false,
}));

// Problems added to the real check's, e.g. a connection that doesn't fit.
const extraProblems: WorkflowProblem[] = [];
vi.mock("./workflowCheck", async (importOriginal) => {
  const original = await importOriginal<typeof import("./workflowCheck")>();
  return {
    ...original,
    checkWorkflow: (...args: Parameters<typeof original.checkWorkflow>) => [
      ...original.checkWorkflow(...args),
      ...extraProblems,
    ],
  };
});

const { runBlockedReason, useWorkflowCheck } = await import("./useWorkflowCheck");
const { resetFeatures } = await import("../../settings/useFeatures");

const responses: Record<string, unknown> = {
  "/execute/docker-status": { dockerAvailable: false, error: "Docker not found" },
  "/execute/nextflow-status": { nextflowAvailable: true, dockerNextflowAvailable: true },
  "/execute/limits": { maxCpus: 2, maxMemory: "4 GB", maxMemoryBytes: 4 * 1024 ** 3 },
};

const input: Node<NodeData> = {
  id: "input",
  type: "fileInput",
  position: { x: 0, y: 0 },
  data: { label: "Reads", files: [] },
};
const output: Node<NodeData> = {
  id: "output",
  type: "outputDisplay",
  position: { x: 0, y: 0 },
  data: { label: "Out", inputs: [{ name: "in" }] },
};
const edges: Edge[] = [{ id: "e", source: "input", target: "output", sourceHandle: "out", targetHandle: "in" }];

describe("useWorkflowCheck", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockImplementation(async (url: string) => {
      if (url in responses) return { data: responses[url] };
      throw new Error("not found");
    });
  });

  it("checks the workflow and the server, and groups problems by node", async () => {
    const { result, unmount } = renderHook(useWorkflowCheck, {
      initialProps: {
        nodes: [input, output],
        edges,
        settings: defaultExecutionSettings,
        missingNfCoreComponents: [],
      },
    });
    await flush();
    const ids = result.current.problems.map((problem) => problem.id);
    expect(ids).toEqual(["input:nofile", "docker", "cpus"]);
    expect(result.current.nodeProblems).toEqual({
      input: [{ level: "error", message: "Add a file to “Reads”: it has nothing to pass on." }],
    });
    expect(result.current.blockedReason).toBe(
      "Can't run yet: Add a file to “Reads”: it has nothing to pass on. (and 1 more problem: see the check next to Run)",
    );
    unmount();
  });

  it("asks the server again on request", async () => {
    const { result, unmount } = renderHook(useWorkflowCheck, {
      initialProps: { nodes: [input, output], edges, settings: defaultExecutionSettings, missingNfCoreComponents: [] },
    });
    await flush();
    expect(get).toHaveBeenCalledTimes(3);
    await act(() => result.current.recheck());
    expect(get).toHaveBeenCalledTimes(6);
    unmount();
  });

  describe("as set in Global Settings → Features", () => {
    const props = { nodes: [input, output], edges, settings: defaultExecutionSettings, missingNfCoreComponents: [] };
    afterEach(() => {
      extraProblems.length = 0;
      resetFeatures();
    });

    it("only warns, without blocking the run", async () => {
      resetFeatures({ workflowCheck: "warn" });
      const { result, unmount } = renderHook(useWorkflowCheck, { initialProps: props });
      await flush();
      expect(result.current.mode).toBe("warn");
      expect(result.current.problems.map((problem) => problem.id)).toContain("input:nofile");
      expect(result.current.blockedReason).toBeNull();
      unmount();
    });

    it("checks nothing when switched off", async () => {
      resetFeatures({ workflowCheck: "off" });
      const { result, unmount } = renderHook(useWorkflowCheck, { initialProps: props });
      await flush();
      expect(result.current.problems).toEqual([]);
      expect(result.current.nodeProblems).toEqual({});
      expect(result.current.blockedReason).toBeNull();
      unmount();
    });

    it("leaves out connections that don't fit while connection hints are off", async () => {
      extraProblems.push({ id: "fit:e", level: "warning", message: "Reads where a genome is expected.", nodeId: "output" });
      const on = renderHook(useWorkflowCheck, { initialProps: props });
      await flush();
      expect(on.result.current.problems.map((problem) => problem.id)).toContain("fit:e");
      on.unmount();

      resetFeatures({ connectionHints: false });
      const off = renderHook(useWorkflowCheck, { initialProps: props });
      await flush();
      expect(off.result.current.problems.map((problem) => problem.id)).not.toContain("fit:e");
      expect(off.result.current.problems.map((problem) => problem.id)).toContain("input:nofile");
      off.unmount();
    });
  });
});

describe("runBlockedReason", () => {
  it("is null without errors", () => {
    expect(runBlockedReason([{ id: "w", level: "warning", message: "Careful." }])).toBeNull();
  });
});
