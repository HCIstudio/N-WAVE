import type { NodeData } from "../../components/nodes/BaseNode";
import { publishDirLines, resultsFolderFor } from "./publish";
import type { Edge, Node } from "reactflow";
import { afterEach, describe, expect, it } from "vitest";
import { generateNextflowScript } from "../../generators";
import catalog from "./catalog.json";
import {
  registerDynamicNodeDefinitions,
  unregisterDynamicNodeDefinitions,
} from "../nodeDefinitions";
import {
  buildNfCoreSubworkflowManifest,
  createNodeDefinitionFromNfCoreSubworkflowManifest,
  type NfCoreSubworkflowCatalogEntry,
} from "./subworkflow";

const entry = (name: string) => {
  const found = (
    catalog as unknown as { subworkflows: NfCoreSubworkflowCatalogEntry[] }
  ).subworkflows.find((subworkflow) => subworkflow.name === name);
  if (!found) throw new Error(`No subworkflow ${name} in the catalog`);
  return found;
};

const definitionFor = (name: string) =>
  createNodeDefinitionFromNfCoreSubworkflowManifest(
    buildNfCoreSubworkflowManifest(entry(name)),
  );

describe("nf-core subworkflow manifests", () => {
  it("turns channel takes into inputs, value takes into settings and emits into outputs", () => {
    const manifest = buildNfCoreSubworkflowManifest(
      entry("quantify_pseudo_alignment"),
    );
    expect(manifest).toMatchObject({
      kind: "subworkflow",
      processName: "QUANTIFY_PSEUDO_ALIGNMENT",
      processType: "nfcore_subworkflow_quantify_pseudo_alignment",
      modulePath: "./subworkflows/nf-core/quantify_pseudo_alignment/main",
    });
    expect(manifest.inputs.map((input) => input.handle)).toEqual([
      "samplesheet",
      "reads",
      "index",
      "transcript_fasta",
      "gtf",
    ]);
    expect(manifest.outputs.map((output) => output.handle)).toContain(
      "counts_gene",
    );

    const definition =
      createNodeDefinitionFromNfCoreSubworkflowManifest(manifest);
    expect(definition.defaults?.nfcoreValues).toMatchObject({
      pseudo_aligner: "",
      skip_merge: false,
      index: "Channel.value([[:], []])",
    });
  });
});

describe("generating nf-core subworkflow calls", () => {
  const definition = definitionFor("bam_sort_stats_samtools");
  const node = (data = {}): Node => ({
    id: "sort",
    type: "process",
    position: { x: 0, y: 0 },
    data: { ...definition.defaults, ...data },
  });
  const publishBlock = (alias: string) =>
    [
      `withName: '${alias}:.*' {`,
      ...publishDirLines(resultsFolderFor(definition.defaults as NodeData, alias)),
      "}",
    ].join("\n");
  const generate = (subworkflow: Node, handles: string[]) =>
    definition.generateNextflow?.({
      node: subworkflow,
      processName: "nfcore_subworkflow_bam_sort_stats_samtools_sort",
      incomingEdges: handles.map((handle, index) => ({
        id: `e${index}`,
        source: `up${index}`,
        target: "sort",
        targetHandle: handle,
      })),
      upstreamChannelName: "",
      outputChannelName: null,
      channelNameMap: new Map([["sort.bam", "sort_bam"]]),
      outputDisplayCounter: 1,
      outputNamingPattern: "",
      workflowName: "wf",
      timestamp: 0,
      date: "",
      resolveChannelNameForEdge: (edge) => `${edge.source}_out`,
      buildMixedChannelExpression: (names) =>
        names.length === 1 ? names[0] : `${names[0]}.mix(${names[1]})`,
      sanitizeVarName: (name) => name.replace(/[^A-Za-z0-9_]/g, "_"),
    });

  it("includes the subworkflow under an alias and passes placeholders for unconnected inputs", () => {
    const result = generate(node(), ["ch_bam"]);
    const alias = "NFCORE_SUBWORKFLOW_BAM_SORT_STATS_SAMTOOLS_SORT";
    expect(result?.includeStatements).toEqual([
      `include { BAM_SORT_STATS_SAMTOOLS as ${alias} } from './subworkflows/nf-core/bam_sort_stats_samtools/main'`,
    ]);
    expect(result?.processInvocations[0]).toBe(
      [
        `    ${alias}(up0_out, Channel.value([[:], [], []]))`,
        `    sort_bam = ${alias}.out.bam`,
        `    nfcore_subworkflow_bam_sort_stats_samtools_sort_index = ${alias}.out.index`,
        `    nfcore_subworkflow_bam_sort_stats_samtools_sort_stats = ${alias}.out.stats`,
        `    nfcore_subworkflow_bam_sort_stats_samtools_sort_flagstat = ${alias}.out.flagstat`,
        `    nfcore_subworkflow_bam_sort_stats_samtools_sort_idxstats = ${alias}.out.idxstats`,
        "",
      ].join("\n"),
    );
    // Every process of the subworkflow saves to the node's results folder.
    expect(result?.nextflowConfigBlocks).toEqual([publishBlock(alias)]);
    expect(
      generate(node({ nfcorePublish: false }), ["ch_bam"])?.nextflowConfigBlocks,
    ).toBeUndefined();
  });

  it("mixes several connections, uses edited placeholders and adds process config", () => {
    const result = generate(
      node({
        nfcoreValues: { ch_fasta_fai: "ch_reference.first()" },
        nfcoreProcessConfig:
          "withName: '.*:SAMTOOLS_SORT' {\n    ext.prefix = { \"${meta.id}.sorted\" }\n}",
      }),
      ["ch_bam", "ch_bam"],
    );
    expect(result?.processInvocations[0]).toContain(
      "(up0_out.mix(up1_out), ch_reference.first())",
    );
    expect(result?.nextflowConfigBlocks).toEqual([
      publishBlock("NFCORE_SUBWORKFLOW_BAM_SORT_STATS_SAMTOOLS_SORT"),
      "withName: '.*:SAMTOOLS_SORT' {\n    ext.prefix = { \"${meta.id}.sorted\" }\n}",
    ]);
  });

  it("waits for a connection", () => {
    expect(generate(node(), [])).toBeNull();
  });

  it("passes value settings as Groovy literals", () => {
    const quantify = definitionFor("quantify_pseudo_alignment");
    const result = quantify.generateNextflow?.({
      node: {
        id: "quant",
        type: "process",
        position: { x: 0, y: 0 },
        data: {
          ...quantify.defaults,
          nfcoreValues: {
            ...quantify.defaults?.nfcoreValues,
            gtf_id_attribute: "gene_id",
            pseudo_aligner: "${params.aligner}",
            kallisto_quant_fraglen: 200,
            skip_merge: true,
          },
        },
      },
      processName: "quant",
      incomingEdges: [
        { id: "e", source: "reads", target: "quant", targetHandle: "reads" },
      ],
      upstreamChannelName: "",
      outputChannelName: null,
      channelNameMap: new Map(),
      outputDisplayCounter: 1,
      outputNamingPattern: "",
      workflowName: "wf",
      timestamp: 0,
      date: "",
      resolveChannelNameForEdge: () => "ch_reads",
      buildMixedChannelExpression: (names) => names[0],
      sanitizeVarName: (name) => name,
    });
    expect(result?.processInvocations[0].split("\n")[0]).toBe(
      "    QUANT(Channel.value([[:], []]), ch_reads, Channel.value([[:], []]), Channel.value([]), Channel.value([]), 'gene_id', '', \"${params.aligner}\", 200, 0, true)",
    );
  });
});

describe("subworkflow nodes in a workflow", () => {
  const definition = definitionFor("bam_stats_samtools");
  const quantify = definitionFor("quantify_pseudo_alignment");
  afterEach(() =>
    unregisterDynamicNodeDefinitions([definition.id, quantify.id]),
  );

  it("doesn't take string settings for channels when ordering the calls", () => {
    registerDynamicNodeDefinitions([quantify]);
    const nodes: Node[] = [
      {
        id: "reads",
        type: "fileInput",
        position: { x: 0, y: 0 },
        data: { files: [{ name: "a.fastq", content: "" }] },
      },
      {
        id: "quant",
        type: "process",
        position: { x: 0, y: 0 },
        data: {
          ...quantify.defaults,
          nfcoreValues: {
            ...quantify.defaults?.nfcoreValues,
            gtf_id_attribute: "gene_id",
            pseudo_aligner: "salmon",
          },
        },
      },
    ];
    const script = generateNextflowScript(
      nodes,
      [
        {
          id: "e",
          source: "reads",
          sourceHandle: "out",
          target: "quant",
          targetHandle: "reads",
        },
      ],
      "wf",
      "results",
      "{workflow_name}",
    );
    expect(script).toContain("'gene_id', '', 'salmon', 0, 0, false)");
  });

  it("generates the include, the call and the downstream channels", () => {
    registerDynamicNodeDefinitions([definition]);
    const nodes: Node[] = [
      {
        id: "bams",
        type: "fileInput",
        position: { x: 0, y: 0 },
        data: { files: [{ name: "a.bam", content: "" }] },
      },
      {
        id: "stats",
        type: "process",
        position: { x: 0, y: 0 },
        data: { ...definition.defaults },
      },
      {
        id: "show",
        type: "outputDisplay",
        position: { x: 0, y: 0 },
        data: {},
      },
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "bams",
        sourceHandle: "out",
        target: "stats",
        targetHandle: "ch_bam_bai",
      },
      {
        id: "e2",
        source: "stats",
        sourceHandle: "flagstat",
        target: "show",
        targetHandle: "in",
      },
    ];
    const script = generateNextflowScript(
      nodes,
      edges,
      "wf",
      "results",
      "{workflow_name}",
    );
    expect(script).toContain(
      "include { BAM_STATS_SAMTOOLS as NFCORE_SUBWORKFLOW_BAM_STATS_SAMTOOLS_STATS } from './subworkflows/nf-core/bam_stats_samtools/main'",
    );
    const workflow = script.slice(script.indexOf("workflow {"));
    const call = workflow.indexOf(
      "NFCORE_SUBWORKFLOW_BAM_STATS_SAMTOOLS_STATS(",
    );
    const consumer = workflow.search(/outputDisplay_show\(\w*flagstat/);
    expect(call).toBeGreaterThan(-1);
    expect(consumer).toBeGreaterThan(call);
  });
});
