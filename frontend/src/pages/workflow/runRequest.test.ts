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

  it("runs an imported workflow's own source while it shows imported processes", () => {
    // Their code is only in the source: generating would run empty stubs.
    const imported = {
      id: "p1",
      type: "process",
      position: { x: 0, y: 0 },
      data: { label: "COUNT_LINES", importedProcess: true },
    } as Node<NodeData>;
    const body = buildRunRequest({
      ...base,
      nodes: [imported],
      rawSource: "process COUNT_LINES { script: 'wc -l' }\nworkflow { COUNT_LINES() }",
      sourceFormat: "nextflow",
    });
    expect(body.nextflowScript).toContain("wc -l");
    expect(body.nextflowScript).not.toContain("Hello World");
  });

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

  it("asks to resume only for a saved workflow", () => {
    const script = { ...base, nodes: [], rawSource: "workflow {}", sourceFormat: "nextflow" as const };
    expect(buildRunRequest({ ...script, resume: true })).toMatchObject({ resume: true });
    expect(buildRunRequest({ ...script })).not.toHaveProperty("resume");
    expect(buildRunRequest({ ...script, workflowId: undefined, resume: true })).not.toHaveProperty(
      "resume",
    );
  });

    it("sends the run profile chosen in the settings", () => {
    const script = { ...base, nodes: [], rawSource: "workflow {}", sourceFormat: "nextflow" as const };
    const hpc = { name: "hpc", executor: "slurm" as const, queue: "short", containerEngine: "none" as const };
    const settings = { ...DEFAULT_EXECUTION_SETTINGS, runProfiles: [hpc], runProfile: "hpc" };
    expect(buildRunRequest({ ...script, settings })).toMatchObject({ runProfile: hpc });
    expect(buildRunRequest({ ...script })).not.toHaveProperty("runProfile");
    expect(() => buildRunRequest({ ...script, settings: { ...settings, runProfile: "gone" } })).toThrow(
      'The run profile "gone" no longer exists',
    );
    expect(() =>
      buildRunRequest({ ...script, settings: { ...settings, runProfiles: [{ ...hpc, queue: "a b" }] } }),
    ).toThrow("can't be used");
    const aws = {
      name: "aws",
      executor: "awsbatch" as const,
      queue: "q",
      containerEngine: "docker" as const,
      awsRegion: "eu-west-1",
      workDir: "s3://bucket/work",
    };
    expect(() =>
      buildRunRequest({ ...script, settings: { ...settings, runProfiles: [aws], runProfile: "aws" } }),
    ).toThrow("for exported projects only");
  });

    it("sends binary input files as base64 and names them", () => {
    const body = buildRunRequest({
      ...base,
      nodes: [
        fileInput("in", [
          { name: "reads.fastq.gz", size: 3, content: "H4sI", encoding: "base64" },
          { name: "notes.txt", size: 2, content: "hi" },
        ]),
      ],
    });
    expect(body).toMatchObject({
      fileContent: { "reads.fastq.gz": "H4sI", "notes.txt": "hi" },
      fileEncoding: { "reads.fastq.gz": "base64" },
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

  it("uses the default naming pattern when the field is empty", () => {
    const body = buildRunRequest({
      ...base,
      nodes: [],
      settings: {
        ...DEFAULT_EXECUTION_SETTINGS,
        output: { ...DEFAULT_EXECUTION_SETTINGS.output, namingPattern: "  " },
      },
    });
    expect(body.executionSettings.outputNaming).toBe(
      "{workflow_name}_{timestamp}",
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

  it("says when N-WAVE stopped a run because it shut down", () => {
    // Not a success, though Nextflow ended without an error of its own.
    expect(
      readRunOutcome(
        "N-WAVE run: r2\nN-WAVE: the run was stopped because N-WAVE shut down. Resume it to reuse the steps it finished.\n",
      ),
    ).toEqual({
      kind: "failed",
      resourceProblem: null,
      reason: "The run was stopped because N-WAVE shut down. Resume it to reuse the steps it finished.",
    });
  });

  it("finds the run id", () => {
    expect(runIdFromOutput("N-WAVE run: bee_7\nmore")).toBe("bee_7");
    expect(runIdFromOutput("nothing")).toBeUndefined();
  });
});
