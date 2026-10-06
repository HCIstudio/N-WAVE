import type { Edge, Node } from "reactflow";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
// Load the registry first, as the app does (it imports the adapters).
import "../nodeDefinitions";
import { createNodeDefinitionFromNfCoreManifest } from "../nfcoreModuleAdapters";
import catalog from "./catalog.json";
import {
  buildNfCoreManifest,
  type NfCoreCatalogEntryForManifest,
} from "./manifest";

const entries = (catalog as { modules: NfCoreCatalogEntryForManifest[] })
  .modules;

const entry = (modulePath: string): NfCoreCatalogEntryForManifest => {
  const found = entries.find(
    (candidate) => candidate.modulePath === modulePath,
  );
  if (!found) throw new Error(`${modulePath} is not in the catalog`);
  return found;
};

/** Generate a module call with the given ports connected to `<port>_up`. */
const generate = (
  modulePath: string,
  connectedPorts: string[],
  data: Partial<NodeData> = {},
) => {
  const definition = createNodeDefinitionFromNfCoreManifest(
    buildNfCoreManifest(entry(modulePath)),
  );
  const node: Node<NodeData> = {
    id: "n1",
    type: definition.type,
    position: { x: 0, y: 0 },
    data: { ...definition.defaults, ...data } as NodeData,
  };
  const incomingEdges: Edge[] = connectedPorts.map((port) => ({
    id: `e-${port}`,
    source: `up-${port}`,
    target: "n1",
    targetHandle: port,
  }));
  const result = definition.generateNextflow?.({
    node,
    processName: "proc_n1",
    incomingEdges,
    upstreamChannelName: null,
    outputChannelName: null,
    channelNameMap: new Map(),
    outputDisplayCounter: 1,
    outputNamingPattern: "",
    workflowName: "wf",
    timestamp: 0,
    date: "",
    resolveChannelNameForEdge: (edge) => `${edge.targetHandle}_up`,
    buildMixedChannelExpression: (names) => `${names.join(".mix(")})`,
    sanitizeVarName: (name) => name.replace(/[^A-Za-z0-9_]/g, "_"),
  });
  return { definition, result };
};

const callOf = (code: string | undefined) => code?.split("\n")[0].trim() ?? "";

describe("nf-core module inputs", () => {
  it("calls star/align with reads, reference tuples and a typed value", () => {
    const { definition, result } = generate("star/align", [
      "reads",
      "index",
      "gtf",
    ]);
    expect(definition.inputs?.map((port) => port.name)).toEqual([
      "reads",
      "index",
      "gtf",
    ]);
    expect(definition.defaults?.nfcoreValues).toEqual({
      star_ignore_sjdbgtf: false,
    });
    expect(result?.includeStatements).toEqual([
      "include { STAR_ALIGN as PROC_N1 } from './modules/nf-core/star/align/main'",
    ]);
    expect(callOf(result?.processInvocations[0])).toBe(
      "PROC_N1(ch_proc_n1_reads_nfcore, ch_proc_n1_index_nfcore, ch_proc_n1_gtf_nfcore, false)",
    );

    const definitions = result?.channelDefinitions?.join("\n") ?? "";
    // Per-sample reads keep the upstream meta, or get one built.
    expect(definitions).toContain("ch_proc_n1_reads_nfcore = reads_up\n");
    expect(definitions).toContain("single_end:");
    // References are value channels so every sample can use them.
    expect(definitions).toContain("ch_proc_n1_index_nfcore = index_up.first()");
    expect(definitions).toContain("ch_proc_n1_gtf_nfcore = gtf_up.first()");
  });

  it("uses the node's value settings", () => {
    const { result } = generate("star/align", ["reads", "index", "gtf"], {
      nfcoreValues: { star_ignore_sjdbgtf: true },
    });
    expect(callOf(result?.processInvocations[0])).toMatch(/, true\)$/);
  });

  it("passes empty placeholders for unconnected optional inputs", () => {
    const { result } = generate("star/align", ["reads", "index"]);
    expect(callOf(result?.processInvocations[0])).toBe(
      "PROC_N1(ch_proc_n1_reads_nfcore, ch_proc_n1_index_nfcore, [[:], []], false)",
    );
  });

  it("waits for the primary input", () => {
    expect(generate("star/align", ["index", "gtf"]).result).toBeNull();
  });

  it("calls salmon/quant with a three-file reference tuple", () => {
    const { definition, result } = generate("salmon/quant", [
      "reads",
      "index",
      "gtf",
      "transcript_fasta",
    ]);
    expect(definition.inputs?.map((port) => port.name)).toEqual([
      "reads",
      "index",
      "gtf",
      "transcript_fasta",
    ]);
    expect(callOf(result?.processInvocations[0])).toBe(
      "PROC_N1(ch_proc_n1_reads_nfcore, ch_proc_n1_index_nfcore)",
    );
    const definitions = result?.channelDefinitions?.join("\n") ?? "";
    expect(definitions).toContain(
      "ch_proc_n1_index_nfcore = index_up.first().map { item -> [item] }\n        .combine(gtf_up.first().map { item -> [item] })\n        .combine(transcript_fasta_up.first().map { item -> [item] })",
    );
    expect(definitions).toContain("tuple(meta, index, gtf, transcript_fasta)");
    // A combined reference must stay a value channel for every sample.
    expect(definitions).toMatch(
      /tuple\(meta, index, gtf, transcript_fasta\)\n\s+\}\.first\(\)/,
    );
  });

  it("calls samtools/sort with an optional fasta reference", () => {
    const { result } = generate("samtools/sort", ["bam"], {
      nfcoreValues: { index_format: "bai" },
    });
    expect(callOf(result?.processInvocations[0])).toBe(
      "PROC_N1(ch_proc_n1_bam_nfcore, [[:], [], []], 'bai')",
    );
  });

  it("joins per-sample files of one tuple by sample", () => {
    const { result } = generate("rseqc/bamstat", ["bam", "bai"]);
    const definitions = result?.channelDefinitions?.join("\n") ?? "";
    expect(definitions).toContain(
      "ch_proc_n1_bam_nfcore = bam_up.map { item -> [item] }\n        .combine(bai_up.map { item -> [item] })\n        .filter { in0, in1 ->",
    );
  });

  it("collects directory-staged inputs into one task", () => {
    const { result } = generate("tximeta/tximport", ["quants", "tx2gene"], {
      nfcoreValues: { quant_type: "salmon" },
    });
    const definitions = result?.channelDefinitions?.join("\n") ?? "";
    expect(definitions).toContain(
      "ch_proc_n1_quants_nfcore = quants_up.map { item ->",
    );
    // Flattened first: paired-end outputs are lists of files per sample.
    expect(definitions).toContain(".flatten().collect()");
    expect(definitions).toContain("[id: 'all_samples']");
    expect(callOf(result?.processInvocations[0])).toBe(
      "PROC_N1(ch_proc_n1_quants_nfcore, ch_proc_n1_tx2gene_nfcore, 'salmon')",
    );
  });

  it("calls modules without inputs", () => {
    const { definition, result } = generate("krona/kronadb", []);
    expect(definition.inputs).toEqual([]);
    expect(callOf(result?.processInvocations[0])).toBe("PROC_N1()");
  });

  it("saves outputs to results/<node name> and sets the output prefix", () => {
    const { result } = generate("custom/gtffilter", ["gtf", "fasta"], {
      label: "Filter GTF",
      nfcoreExtPrefix: "${meta.id}.filtered",
    });
    expect(result?.nextflowConfigBlocks).toEqual([
      [
        "withName: 'PROC_N1' {",
        '  ext.prefix = { "${meta.id}.filtered" }',
        "  publishDir = [",
        '    path: { "${params.outdir}/filter_gtf" },',
        "    mode: 'copy',",
        "    saveAs: { filename -> filename.equals('versions.yml') ? null : filename }",
        "  ]",
        "}",
      ].join("\n"),
    ]);
    // A plain prefix is a string; saving can be turned off.
    expect(
      generate("custom/gtffilter", ["gtf", "fasta"], {
        nfcoreExtPrefix: "genes.filtered",
        nfcorePublish: false,
      }).result?.nextflowConfigBlocks,
    ).toEqual(["withName: 'PROC_N1' {\n  ext.prefix = 'genes.filtered'\n}"]);
  });
});
