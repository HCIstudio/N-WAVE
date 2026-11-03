import { processNamesFor } from "./naming";
import { describe, it, expect, vi } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../../components/nodes/BaseNode";
import { installNfCoreModule, makeNode } from "../../test/nodes";
import {
  buildMixedChannelExpression,
  generateNextflowScript,
  getProcessNameForNode,
  sanitizeVarName,
} from "./generateNextflowScript";
import { demoWorkflowSeed } from "../../demo/demoWorkflow";
import { extractNextflowConfig } from "../../export/exportProject";
import {
  createStoredCustomNode,
  parseCustomNodeSource,
  registerCustomNodes,
} from "../../registry/customNodes";

// The built-in demo graph is a realistic input: file input -> two filter
// branches (one mapped to uppercase) -> merge -> display output.
const nodes = demoWorkflowSeed.nodes as unknown as Node[];
const edges = demoWorkflowSeed.edges as unknown as Edge[];

describe("generateNextflowScript", () => {
  const script = generateNextflowScript(
    nodes,
    edges,
    "Demo Workflow",
    "results",
    "{workflow_name}"
  );

  it("produces a DSL2-style script with params and a workflow block", () => {
    expect(script).toContain("params.outdir = 'results'");
    expect(script).toMatch(/workflow\s*\{/);
    expect(script).toContain("process ");
  });

  it("emits process logic for the filter and map operators", () => {
    // filter branches use grep with the configured keywords
    expect(script).toContain("grep");
    expect(script).toMatch(/Barry|Bee/);
    // the uppercase map uses tr
    expect(script.toLowerCase()).toContain("tr '[:lower:]' '[:upper:]'");
  });

  it("references the input channel from the file input node", () => {
    expect(script).toContain("ch_files");
  });

  it("does not warn about the file-input channel as an unresolved variable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      generateNextflowScript(
        nodes,
        edges,
        "Demo Workflow",
        "results",
        "{workflow_name}"
      );
      const messages = warn.mock.calls.map((args) => String(args[0]));
      expect(messages.some((m) => m.includes("ch_files"))).toBe(false);
      expect(messages.some((m) => m.includes("unresolved variable"))).toBe(
        false
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("is deterministic for the same graph within a run", () => {
    const again = generateNextflowScript(
      nodes,
      edges,
      "Demo Workflow",
      "results",
      "{workflow_name}"
    );
    // Process names embed a timestamp, so compare structure rather than exact
    // text: both runs should have the same number of process blocks.
    const count = (s: string) => (s.match(/process\s+\w+/g) || []).length;
    expect(count(again)).toBe(count(script));
    expect(count(script)).toBeGreaterThan(0);
  });
});

describe("generateNextflowScript with nf-core modules", () => {
  it("defines a module's input channel after the call that produces it", async () => {
    // Registry first, as the app does (the adapters import it).
    await import("../../registry/nodeDefinitions");
    const { registerDynamicNodeDefinitions, nodeDefinitions } = await import(
      "../../registry/nodeDefinitions"
    );
    const { createNodeDefinitionFromNfCoreManifest } = await import(
      "../../registry/nfcoreModuleAdapters"
    );
    const { buildNfCoreManifest } = await import(
      "../../registry/nfcore/manifest"
    );
    const catalog = (await import("../../registry/nfcore/catalog.json"))
      .default as { modules: Parameters<typeof buildNfCoreManifest>[0][] };
    const multiqcEntry = catalog.modules.find(
      (entry) => entry.id === "nf-core/multiqc"
    );
    if (!multiqcEntry) throw new Error("nf-core/multiqc is not in the catalog");
    const multiqcDefinition = createNodeDefinitionFromNfCoreManifest(
      buildNfCoreManifest(multiqcEntry)
    );
    registerDynamicNodeDefinitions([multiqcDefinition]);
    const fastqcId = installNfCoreModule("nf-core/fastqc");

    const node = (id: string, definitionId: string, data = {}): Node => {
      const definition = nodeDefinitions.find(
        (entry) => entry.id === definitionId
      );
      if (!definition) throw new Error(`No node definition ${definitionId}`);
      return {
        id,
        type: definition.type,
        position: { x: 0, y: 0 },
        data: { ...definition.defaults, ...data },
      };
    };
    const graphNodes = [
      // MultiQC first, so node order alone can't produce the right order.
      node("multiqc", multiqcDefinition.id),
      node("reads", "fileInput", {
        files: [{ name: "sample.fastq", content: "@r1\nACGT\n+\nIIII\n" }],
      }),
      node("fastqc", fastqcId),
    ];
    const graphEdges: Edge[] = [
      { id: "e1", source: "reads", sourceHandle: "out", target: "fastqc", targetHandle: "reads" },
      { id: "e2", source: "fastqc", sourceHandle: "zip", target: "multiqc", targetHandle: "multiqc_files" },
    ];

    const generated = generateNextflowScript(
      graphNodes,
      graphEdges,
      "qc",
      "results",
      "{workflow_name}"
    );
    const workflowBlock = generated.slice(generated.indexOf("workflow {"));
    // Named after their labels; MultiQC reads FastQC's output as FASTQC.out.zip.
    expect(generated).toContain("include { FASTQC } from './modules/nf-core/fastqc/main'");
    const fastqcCall = workflowBlock.search(/\bFASTQC\(/);
    const multiqcInput = workflowBlock.search(/\bch_multiqc_multiqc_files = FASTQC\.out\.zip\b/);
    const multiqcCall = workflowBlock.search(/\bMULTIQC\(/);

    expect(fastqcCall).toBeGreaterThan(-1);
    expect(multiqcInput).toBeGreaterThan(fastqcCall);
    expect(multiqcCall).toBeGreaterThan(multiqcInput);
  });

  it("keeps code that starts with a comment in dependency order", async () => {
    await import("../../registry/nodeDefinitions");
    const { nodeDefinitions } = await import("../../registry/nodeDefinitions");
    const operator = nodeDefinitions.find((entry) => entry.id === "channelOperator");
    const display = nodeDefinitions.find((entry) => entry.id === "outputDisplay");
    if (!operator || !display) throw new Error("missing definitions");
    const graphNodes: Node[] = [
      // The display first, so node order alone can't produce the right order.
      {
        id: "show",
        type: display.type,
        position: { x: 0, y: 0 },
        data: { ...display.defaults },
      },
      {
        id: "reads",
        type: "fileInput",
        position: { x: 0, y: 0 },
        data: {
          files: [{ name: "a.txt", content: "a" }],
          outputs: [{ name: "out", isConnectable: true }],
        },
      },
      {
        id: "op",
        type: operator.type,
        position: { x: 0, y: 0 },
        data: {
          ...operator.defaults,
          channelOperatorCode: "// Mix the inputs.\noutput.joined = input.left.mix(input.right)",
        },
      },
    ];
    const graphEdges: Edge[] = [
      { id: "e1", source: "reads", sourceHandle: "out", target: "op", targetHandle: "left" },
      { id: "e2", source: "op", sourceHandle: "joined", target: "show", targetHandle: "in" },
    ];
    const generated = generateNextflowScript(
      graphNodes,
      graphEdges,
      "mix",
      "results",
      "{workflow_name}"
    );
    const workflowBlock = generated.slice(generated.indexOf("workflow {"));
    const channel = workflowBlock.match(/(ch_\w+) = ch_files\.mix\(channel\.empty\(\)\)/)?.[1];
    expect(channel).toBeDefined();
    const defined = workflowBlock.indexOf(`${channel} = `);
    const used = workflowBlock.search(new RegExp(`[A-Z_]+\\(${channel}\\b`));
    expect(used).toBeGreaterThan(defined);
  });
});

describe("generateNextflowScript edge cases", () => {
  const fileInput = (
    files: { name: string; size: number; content: string }[],
  ) => ({ ...makeNode("fileInput", { files }), id: "in" }) as Node<NodeData>;
  const filter = {
    ...makeNode("filter", { filterText: "x", filterMode: "contains" }),
    id: "f",
  } as Node<NodeData>;
  const edge = (sourceHandle: string): Edge => ({
    id: "e",
    source: "in",
    sourceHandle,
    target: "f",
    targetHandle: "in",
  });
  const generate = (
    nodesIn: Node<NodeData>[],
    edgesIn: Edge[],
    outdir = "results",
  ) =>
    generateNextflowScript(nodesIn, edgesIn, "Flow", outdir, "{workflow_name}");

  it("lists the selected files as params", () => {
    const script = generate(
      [fileInput([{ name: "a.txt", size: 1, content: "a" }])],
      [],
    );
    expect(script).toContain("params.files = ['a.txt']");
    expect(script).toContain("ch_files = channel.fromList(params.files)");
  });

  it("gives a File Input without files an empty channel", () => {
    const script = generate([fileInput([])], []);
    expect(script).toContain("params.files = []");
    expect(script).toContain("ch_files = channel.empty()");
  });

  it("gives each File Input its own files param and channel", () => {
    const second = {
      ...makeNode("fileInput", {
        files: [{ name: "b.txt", size: 1, content: "b" }],
      }),
      id: "in2",
    } as Node<NodeData>;
    const filter2 = { ...filter, id: "f2" } as Node<NodeData>;
    const script = generate(
      [fileInput([{ name: "a.txt", size: 1, content: "a" }]), second, filter, filter2],
      [edge("out"), { ...edge("out"), id: "e2", source: "in2", target: "f2" }],
    );
    const nodesIn = [fileInput([{ name: "a.txt", size: 1, content: "a" }]), second, filter, filter2];
    expect(script).toContain("params.files = ['a.txt']");
    expect(script).toContain("params.files_2 = ['b.txt']");
    expect(script).toContain("ch_files_2 = channel.fromList(params.files_2)");
    // Plain files go into the step as they are.
    expect(script).toContain(`${getProcessNameForNode(filter, nodesIn)}(ch_files)`);
    expect(script).toContain(`${getProcessNameForNode(filter2, nodesIn)}(ch_files_2)`);
  });

  it("quotes file names and the output directory as Groovy strings", () => {
    const script = generate(
      [fileInput([{ name: "patient's.fq", size: 1, content: "a" }])],
      [],
      "/home/o'brien/results",
    );
    expect(script).toContain(String.raw`params.files = ['patient\'s.fq']`);
    expect(script).toContain(String.raw`params.outdir = '/home/o\'brien/results'`);
  });

  it("quotes selected file names in a Filter's file filter", () => {
    const script = generate(
      [
        fileInput([{ name: "o'k.txt", size: 1, content: "a" }]),
        {
          ...filter,
          data: { ...filter.data, selectedFilterFiles: [{ name: "o'k.txt" }] },
        } as Node<NodeData>,
      ],
      [edge("out")],
    );
    expect(script).toContain(String.raw`file.name == 'o\'k.txt'`);
  });

  it("keeps a custom process labelled Save before the steps using it", () => {
    const source = [
      "process SAVE_RESULTS {",
      "  input:",
      "  path x",
      "  output:",
      "  path 'out.txt', emit: out",
      "  script:",
      '  """',
      "  cp $x out.txt",
      '  """',
      "}",
    ].join("\n");
    const parsed = parseCustomNodeSource(source);
    const custom = createStoredCustomNode(
      { label: "Save results", description: "", icon: "Code", source },
      parsed,
      { inputs: parsed.inputs, outputs: parsed.outputs },
    );
    registerCustomNodes([custom]);
    const save = { ...makeNode(custom.id), id: "n1" } as Node<NodeData>;
    const script = generate(
      [fileInput([]), save, filter],
      [
        { ...edge("out"), id: "e1", target: "n1", targetHandle: parsed.inputs[0].name },
        { id: "e2", source: "n1", sourceHandle: "out", target: "f", targetHandle: "in" },
      ],
    );
    const nodesIn = [fileInput([]), save, filter];
    const call = script.indexOf(`${getProcessNameForNode(save, nodesIn)}(`, script.indexOf("workflow {"));
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(
      script.indexOf(`${getProcessNameForNode(filter, nodesIn)}(`, script.indexOf("workflow {")),
    );
  });

  it("keeps a */ in a config value inside the embedded config", () => {
    const parameters = makeNode("parameters", {
      parameters: [{ name: "reads", type: "text", value: "data/*/R1.fastq" }],
    });
    const script = generate([parameters], []);
    const { script: cleaned, config } = extractNextflowConfig(script);
    expect(config).toContain("reads = 'data/*/R1.fastq'");
    expect(cleaned).not.toContain("N-WAVE_NEXTFLOW_CONFIG");
    expect(cleaned).toContain("workflow {");
    expect(cleaned).not.toContain("R1.fastq'\n}");
  });

  it("uses forward slashes in the output directory", () => {
    expect(generate([], [], "out\\run")).toContain("params.outdir = 'out/run'");
  });

  it("skips a node nothing is connected to", () => {
    const script = generate([fileInput([]), filter], []);
    expect(script).not.toContain("process FILTER");
  });

  it("falls back to another output of the source when the handle is unknown", () => {
    const nodesIn = [fileInput([]), filter];
    const script = generate(nodesIn, [edge("no_such_handle")]);
    expect(script).toContain(`${getProcessNameForNode(filter, nodesIn)}(ch_files)`);
  });

  it("skips a node whose source has no channel", () => {
    const note = { ...makeNode("note"), id: "in" } as Node<NodeData>;
    const script = generate([note, filter], [edge("out")]);
    expect(script.slice(script.indexOf("workflow {"))).not.toContain("FILTER(");
  });
});

describe("generator helpers", () => {
  it("names each step after its label, uniquely and in the order nodes were added", () => {
    const step = (id: string, label: string): Node =>
      ({ id, type: "process", position: { x: 0, y: 0 }, data: { label } }) as Node;
    const nodesIn = [step("n2", "FastQC (raw reads)"), step("n1", "FastQC (raw reads)"), step("n3", "Ünïcode 1st"), step("n4", "")];
    const names = processNamesFor(nodesIn);
    expect(names.get("n1")).toBe("FASTQC_RAW_READS");
    expect(names.get("n2")).toBe("FASTQC_RAW_READS_2");
    expect(names.get("n3")).toBe("UNICODE_1ST");
    expect(names.get("n4")).toBe("PROCESS");
    expect(getProcessNameForNode(nodesIn[0], nodesIn)).toBe("FASTQC_RAW_READS_2");
  });

  it("names a node's process after its type and ID", () => {
    expect(
      getProcessNameForNode({
        id: "node 1-a",
        type: "operator",
        position: { x: 0, y: 0 },
        data: { operatorType: "filter" },
      }),
    ).toBe("filter_node_1_a");
    expect(
      getProcessNameForNode({ id: "n", position: { x: 0, y: 0 }, data: {} }),
    ).toBe("process_n");
    // Node pack ids may hold dots or start with a digit.
    const packNode = (processType: string) =>
      getProcessNameForNode({ id: "n1", type: "process", position: { x: 0, y: 0 }, data: { processType } });
    expect(packNode("bio.cat-file")).toBe("bio_cat_file_n1");
    expect(packNode("1cat")).toBe("p_1cat_n1");
  });

  it("concatenates several channels", () => {
    expect(buildMixedChannelExpression(["a"])).toBe("a");
    expect(buildMixedChannelExpression(["a", "b", "c"])).toBe(
      "a.concat(b).concat(c)",
    );
  });

  it("makes Groovy variable names", () => {
    expect(sanitizeVarName("node-1 out")).toBe("node_1_out");
    expect(sanitizeVarName("1st")).toBe("v_1st");
  });
});
