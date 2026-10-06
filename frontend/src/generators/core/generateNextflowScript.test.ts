import { describe, it, expect, vi } from "vitest";
import type { Edge, Node } from "reactflow";
import { generateNextflowScript } from "./generateNextflowScript";
import { demoWorkflowSeed } from "../../demo/demoWorkflow";

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
      node("fastqc", "fastqc"),
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
    const fastqcCall = workflowBlock.search(/\bFASTQC_FASTQC\(/);
    const zipAssignment = workflowBlock.search(/\bfastqc_zip = FASTQC_FASTQC\.out\.zip/);
    const multiqcInput = workflowBlock.search(
      /\bch_\w*multiqc_files_nfcore = fastqc_zip\b/
    );
    const multiqcCall = workflowBlock.search(/\bNFCORE_MULTIQC_MULTIQC\(/);

    expect(fastqcCall).toBeGreaterThan(-1);
    expect(zipAssignment).toBeGreaterThan(fastqcCall);
    expect(multiqcInput).toBeGreaterThan(zipAssignment);
    expect(multiqcCall).toBeGreaterThan(multiqcInput);
  });
});
