import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import { DEFAULT_EXECUTION_SETTINGS } from "./executionSettings";
import {
  buildRunRequest,
  findMissingFileContents,
  findRunProblem,
  readRunOutcome,
  runIdFromOutput,
} from "./runRequest";

const fileInput = (id: string, files?: NodeData["files"]) =>
  ({
    id,
    type: "fileInput",
    position: { x: 0, y: 0 },
    data: { label: id, files },
  }) as Node<NodeData>;
const edge = (source: string, target: string) =>
  ({ id: `${source}-${target}`, source, target }) as Edge;

describe("findRunProblem", () => {
  it("asks for files in connected File Inputs", () => {
    expect(findRunProblem([fileInput("Reads")], [edge("Reads", "x")])).toBe(
      'Add a file to "Reads" before running the workflow.',
    );
    // Unconnected ones don't matter.
    expect(findRunProblem([fileInput("Reads")], [])).toBeNull();
  });

  it("lists uploaded files whose content is gone", () => {
    const nodes = [
      fileInput("in", [
        { name: "a.txt", size: 1, content: "" },
        { name: "b.txt", size: 1, content: "b" },
      ]),
    ];
    expect(findMissingFileContents(nodes)).toEqual(["a.txt"]);
    expect(findRunProblem(nodes, [])).toContain("1 file missing content");
    expect(findRunProblem(nodes, [])).toContain("• a.txt");
  });

  it("is null when the workflow can run", () => {
    expect(
      findRunProblem(
        [fileInput("in", [{ name: "a.txt", size: 1, content: "a" }])],
        [edge("in", "x")],
      ),
    ).toBeNull();
  });
});

describe("buildRunRequest", () => {
  const base = {
    edges: [],
    workflowId: "wf1",
    workflowName: "My run",
    settings: DEFAULT_EXECUTION_SETTINGS,
    launch: null,
    rawSource: null,
    sourceFormat: "visual" as const,
  };

  it("runs an imported workflow's own source while it has no nodes", () => {
    const body = buildRunRequest({
      ...base,
      nodes: [],
      rawSource: "workflow { println 'hi' }",
      sourceFormat: "nextflow",
    });
    expect(body).toMatchObject({
      nextflowScript: "workflow { println 'hi' }",
      workflowName: "My run",
      workflowId: "wf1",
      fileContent: {},
      executionSettings: { maxCpus: 4, executionTimeout: 0 },
    });
  });

  it("generates the script from the canvas, into the chosen directory", () => {
    const body = buildRunRequest({
      ...base,
      nodes: [],
      settings: {
        ...DEFAULT_EXECUTION_SETTINGS,
        output: { ...DEFAULT_EXECUTION_SETTINGS.output, directory: "out" },
      },
    });
    expect(body).toHaveProperty("nextflowScript");
    expect((body as { nextflowScript: string }).nextflowScript).toContain(
      "params.outdir = 'out'",
    );
  });

  it("sends a pipeline launch instead of a script", () => {
    const body = buildRunRequest({
      ...base,
      nodes: [],
      launch: {
        nodeId: "p",
        name: "rnaseq",
        version: "3.27.0",
        profiles: ["docker"],
        params: { input: "inputs/samplesheet.csv" },
        inputFiles: [{ name: "samplesheet.csv", content: "sample\n" }],
      } as never,
    });
    expect(body).toMatchObject({
      pipeline: { name: "rnaseq", version: "3.27.0", profiles: ["docker"] },
      fileContent: { "samplesheet.csv": "sample\n" },
    });
    expect(body).not.toHaveProperty("nextflowScript");
  });
});

describe("readRunOutcome", () => {
  it("reads success, failure, resource problems and cancellation", () => {
    expect(readRunOutcome("N-WAVE run: r1\nDone")).toEqual({ kind: "succeeded" });
    expect(
      readRunOutcome("Nextflow execution failed with exit code 1"),
    ).toEqual({ kind: "failed", resourceProblem: null });
    expect(readRunOutcome("ERROR ~ boom").kind).toBe("failed");
    expect(readRunOutcome("x\nExecution cancelled\n")).toEqual({
      kind: "cancelled",
    });
  });

  it("finds the run id", () => {
    expect(runIdFromOutput("N-WAVE run: bee_7\nmore")).toBe("bee_7");
    expect(runIdFromOutput("nothing")).toBeUndefined();
  });
});
