import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import { defaultExecutionSettings } from "../../workflows/defaultExecutionSettings";
import { type CheckContext, checkWorkflow, memoryBytes } from "./workflowCheck";

const node = (id: string, type: string, data: Partial<NodeData> = {}): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: { label: id, ...data },
});
const edge = (source: string, target: string, sourceHandle = "out", targetHandle = "in"): Edge => ({
  id: `${source}-${target}-${targetHandle}`,
  source,
  target,
  sourceHandle,
  targetHandle,
});

const context = (change: Partial<CheckContext> = {}): CheckContext => ({
  missingNfCoreComponents: [],
  settings: defaultExecutionSettings,
  docker: null,
  nextflow: null,
  limits: null,
  ...change,
});

const file = { name: "a.txt", content: "hello", size: 5 };
const input = (files = [file]) => node("input", "fileInput", { files });
const filter = node("filter", "operator", { inputs: [{ name: "in" }], outputs: [{ name: "out" }] });
const output = node("output", "outputDisplay", { inputs: [{ name: "in" }] });
const chain = [edge("input", "filter"), edge("filter", "output")];

const messages = (nodes: Node<NodeData>[], edges: Edge[], change?: Partial<CheckContext>) =>
  checkWorkflow(nodes, edges, context(change)).map(({ level, nodeId, message }) => ({ level, nodeId, message }));

describe("checkWorkflow", () => {
  it("finds nothing wrong with a connected workflow that has its files", () => {
    expect(messages([input(), filter, output], chain)).toEqual([]);
  });

  it("stops a one-connection input with several connections, saved before the rule", () => {
    const second = node("input2", "fileInput", { files: [{ ...file, name: "b.txt" }] });
    expect(
      messages([input(), second, filter, output], [...chain, edge("input2", "filter")]).filter(
        (problem) => problem.level === "error",
      ),
    ).toEqual([
      {
        level: "error",
        nodeId: "filter",
        message:
          "“filter” takes one connection on “in” but has 2. Connect them to a Merge node (or mix them in a channel operator) and connect that instead.",
      },
    ]);
  });

  it("stops an empty workflow", () => {
    expect(messages([node("n", "note")], [])).toEqual([
      expect.objectContaining({ level: "error", message: expect.stringContaining("The workflow is empty") }),
    ]);
  });

  it("warns about a node that isn't connected", () => {
    expect(messages([input(), filter, output, node("lonely", "operator", { inputs: [{ name: "in" }] })], chain)).toEqual([
      { level: "warning", nodeId: "lonely", message: "“lonely” isn't connected to anything, so it won't take part in the run." },
    ]);
  });

  it("needs the main input of a connected step", () => {
    const process = node("fastqc", "process", { inputs: [{ name: "reads" }, { name: "extra" }], outputs: [{ name: "html" }] });
    const result = messages([process, output], [edge("fastqc", "output", "html")]);
    expect(result).toEqual([
      expect.objectContaining({ level: "error", nodeId: "fastqc", message: expect.stringContaining("“reads” input") }),
    ]);
  });

  it("needs both inputs of a channel operator", () => {
    const join = node("join", "channelOperator", { inputs: [{ name: "left" }, { name: "right" }], outputs: [{ name: "joined" }] });
    const result = messages([input(), join], [edge("input", "join", "out", "left")]);
    expect(result).toEqual([
      expect.objectContaining({ level: "error", nodeId: "join", message: expect.stringContaining("“right” input") }),
    ]);
  });

  it("needs a file in a connected File Input, and its content after a reload", () => {
    expect(messages([input([]), filter, output], chain)).toEqual([
      expect.objectContaining({ level: "error", nodeId: "input", message: "Add a file to “input”: it has nothing to pass on." }),
    ]);
    expect(messages([input([{ ...file, content: "" }]), filter, output], chain)).toEqual([
      expect.objectContaining({ level: "error", nodeId: "input", message: expect.stringContaining("Upload “a.txt” again") }),
    ]);
  });

  it("reports samplesheet rows with problems on the samplesheet", () => {
    const sheet = node("sheet", "samplesheet", { samplesheet: "sample,fastq_1,fastq_2\n,reads.fq.gz,\n" });
    const result = messages([sheet, node("p", "process", { inputs: [{ name: "reads" }] })], [edge("sheet", "p", "samples", "reads")]);
    expect(result.some((problem) => problem.level === "error" && problem.nodeId === "sheet")).toBe(true);
  });

  it("reports parameter problems and empty values", () => {
    const params = node("params", "parameters", {
      parameters: [
        { name: "1bad", type: "text", value: "x" },
        { name: "greeting", type: "text", value: "" },
      ],
    });
    const result = messages([input(), filter, output, params], chain);
    expect(result).toEqual([
      expect.objectContaining({ level: "error", nodeId: "params", message: expect.stringContaining("isn't a valid name") }),
      { level: "warning", nodeId: "params", message: "params.greeting has no value." },
    ]);
  });

  it("says which nf-core component isn't installed, on its node", () => {
    const module = node("fastqc", "process", { nwaveNfCoreModuleId: "nf-core/fastqc" });
    expect(messages([input(), module], [edge("input", "fastqc", "out", "reads")], { missingNfCoreComponents: ["nf-core/fastqc"] })).toEqual([
      expect.objectContaining({ level: "error", nodeId: "fastqc", message: expect.stringContaining("nf-core/fastqc isn't installed") }),
    ]);
  });

  it("checks a pipeline's launch on the pipeline node", () => {
    const pipeline = node("pipe", "pipeline", { pipelineName: "rnaseq", pipelineVersion: "3.14.0" });
    expect(messages([pipeline], [])).toEqual([
      expect.objectContaining({ level: "error", nodeId: "pipe", message: expect.stringContaining("Connect a samplesheet") }),
    ]);
  });

  it("stops a run without Nextflow, and without Docker when steps need it", () => {
    const nodes = [input(), filter, output];
    expect(messages(nodes, chain, { nextflow: { nextflowAvailable: false, dockerNextflowAvailable: false } })).toEqual([
      expect.objectContaining({ level: "error", message: expect.stringContaining("Nextflow isn't available") }),
    ]);
    const docker = { dockerAvailable: false, error: "Docker Desktop not running" };
    const withoutDocker = { ...defaultExecutionSettings, container: { ...defaultExecutionSettings.container, enabled: false } };
    expect(messages(nodes, chain, { docker, settings: withoutDocker })).toEqual([]);
    const withDocker = { ...defaultExecutionSettings, container: { ...defaultExecutionSettings.container, enabled: true } };
    expect(messages(nodes, chain, { docker, settings: withDocker })).toEqual([
      expect.objectContaining({ level: "error", message: expect.stringContaining("(Docker Desktop not running)") }),
    ]);
  });

  it("warns when the run asks for more than the server allows", () => {
    const settings = {
      ...defaultExecutionSettings,
      resources: { ...defaultExecutionSettings.resources, maxCpus: 16, maxMemory: "32.GB" },
    };
    const limits = { maxCpus: 4, maxMemory: "8 GB", maxMemoryBytes: 8 * 1024 ** 3 };
    expect(messages([input(), filter, output], chain, { settings, limits })).toEqual([
      expect.objectContaining({ level: "warning", message: expect.stringContaining("it will get 4") }),
      expect.objectContaining({ level: "warning", message: expect.stringContaining("it will get 8 GB") }),
    ]);
  });

  it("lists errors before warnings", () => {
    const result = checkWorkflow([input([]), filter, output, node("lonely", "operator")], chain, context());
    expect(result.map((problem) => problem.level)).toEqual(["error", "warning"]);
  });
});

describe("memoryBytes", () => {
  it("reads Nextflow memory values", () => {
    expect(memoryBytes("4.GB")).toBe(4 * 1024 ** 3);
    expect(memoryBytes("512 MB")).toBe(512 * 1024 ** 2);
    expect(memoryBytes("2gb")).toBe(2 * 1024 ** 3);
    expect(memoryBytes("lots")).toBeNull();
  });
});
