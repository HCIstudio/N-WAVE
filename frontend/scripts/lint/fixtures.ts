// Workflows whose generated Nextflow is linted in CI (see README.md here):
// the built-in examples and templates, and node combinations the examples don't cover.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../../src/components/nodes/BaseNode";
import { demoWorkflowSeed } from "../../src/demo/demoWorkflow";
import rnaseqStarSalmon from "../../src/demo/rnaseqStarSalmonExample.json";
import qcFastqTemplate from "../../src/templates/qcFastqTemplate.json";
import { CHANNEL_OPERATOR_TEMPLATES } from "../../src/registry/channelOperator";
import {
  createStoredCustomNode,
  parseCustomNodeSource,
  registerCustomNodes,
  type StoredCustomNode,
} from "../../src/registry/customNodes";
import catalog from "../../src/registry/nfcore/catalog.json";
import {
  buildNfCoreManifest,
  type NfCoreCatalogEntryForManifest,
} from "../../src/registry/nfcore/manifest";
import {
  buildNfCoreSubworkflowManifest,
  createNodeDefinitionFromNfCoreSubworkflowManifest,
  isNfCoreSubworkflowId,
  type NfCoreSubworkflowCatalogEntry,
} from "../../src/registry/nfcore/subworkflow";
import { migrateLegacyNfCoreNode } from "../../src/registry/nfcore/legacyNodes";
import { createNodeDefinitionFromNfCoreManifest } from "../../src/registry/nfcoreModuleAdapters";
import {
  nodeDefinitions,
  registerDynamicNodeDefinitions,
} from "../../src/registry/nodeDefinitions";

export interface LintFixture {
  name: string;
  description: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

/** Register the nf-core nodes the given nodes use, from the pinned catalog. */
export const registerNfCoreNodes = (nodes: Node<NodeData>[]): void => {
  const ids = new Set(
    nodes
      .map((node) => node.data.nwaveNfCoreModuleId)
      .filter((id): id is string => typeof id === "string"),
  );
  const modules = (catalog as { modules: NfCoreCatalogEntryForManifest[] })
    .modules;
  const subworkflows = (
    catalog as unknown as { subworkflows: NfCoreSubworkflowCatalogEntry[] }
  ).subworkflows;
  registerDynamicNodeDefinitions(
    Array.from(ids).map((id) => {
      if (isNfCoreSubworkflowId(id)) {
        const entry = subworkflows.find((candidate) => candidate.id === id);
        if (!entry) throw new Error(`${id} is not in the nf-core catalog`);
        return createNodeDefinitionFromNfCoreSubworkflowManifest(
          buildNfCoreSubworkflowManifest(entry),
        );
      }
      const entry = modules.find((candidate) => candidate.id === id);
      if (!entry) throw new Error(`${id} is not in the nf-core catalog`);
      return createNodeDefinitionFromNfCoreManifest(buildNfCoreManifest(entry));
    }),
  );
};

let nextId = 0;
/** A canvas node created the way the "Add node" menu creates it. */
const node = (
  definitionId: string,
  data: Partial<NodeData> = {},
): Node<NodeData> => {
  const definition = nodeDefinitions.find((entry) => entry.id === definitionId);
  if (!definition) throw new Error(`No node definition ${definitionId}`);
  nextId += 1;
  return {
    id: `${definitionId.replace(/\W+/g, "_")}_${nextId}`,
    type: definition.type,
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      icon: definition.icon,
      ...definition.defaults,
      ...data,
    } as NodeData,
  };
};

const edge = (
  source: Node,
  sourceHandle: string,
  target: Node,
  targetHandle: string,
): Edge => ({
  id: `${source.id}.${sourceHandle}-${target.id}.${targetHandle}`,
  source: source.id,
  sourceHandle,
  target: target.id,
  targetHandle,
  type: "default",
});

const SAMPLESHEET = [
  "sample,fastq_1,fastq_2",
  "A,reads/A_1.fq.gz,reads/A_2.fq.gz",
  "B,reads/B_1.fq.gz,",
  "",
].join("\n");

const samplesheet = () =>
  node("samplesheet", {
    samplesheet: SAMPLESHEET,
    samplesheetFileName: "samplesheet.csv",
    samplesheetMapping: {
      idColumn: "sample",
      read1Column: "fastq_1",
      read2Column: "fastq_2",
    },
    outputs: [{ name: "samples", label: "Samples", isConnectable: true }],
  });

/** Every channel operator template, fed from a samplesheet. */
const channelOperators = (): LintFixture => {
  const sheet = samplesheet();
  const nodes: Node<NodeData>[] = [sheet];
  const edges: Edge[] = [];
  for (const template of CHANNEL_OPERATOR_TEMPLATES) {
    const operator = node("channelOperator", {
      label: template.label,
      subtitle: template.label,
      channelOperatorTemplate: template.id,
      channelOperatorCode: template.code,
      inputs: template.inputs.map((name) => ({
        name,
        label: name,
        isConnectable: true,
      })),
      outputs: template.outputs.map((name) => ({
        name,
        label: name,
        isConnectable: true,
      })),
    });
    nodes.push(operator);
    for (const input of template.inputs) {
      edges.push(edge(sheet, "samples", operator, input));
    }
  }
  return {
    name: "channel-operators",
    description: "Every channel operator template on samplesheet rows",
    nodes,
    edges,
  };
};

const customNode = (
  source: string,
  label: string,
  edit: (stored: StoredCustomNode) => StoredCustomNode = (stored) => stored,
): StoredCustomNode => {
  const parsed = parseCustomNodeSource(source);
  return edit(
    createStoredCustomNode(
      { label, description: `${label} node`, icon: "Code", source },
      parsed,
      { inputs: parsed.inputs, outputs: parsed.outputs },
    ),
  );
};

/**
 * A custom process with a value setting and ext.args, feeding a custom
 * workflow node converted from an nf-core subworkflow.
 */
const customNodes = (): LintFixture => {
  const trimReads = customNode(
    [
      "process TRIM_READS {",
      "  input:",
      "  tuple val(meta), path(reads)",
      "  val min_length",
      "  output:",
      "  tuple val(meta), path('*.trimmed.fq.gz'), emit: reads",
      "  script:",
      '  """',
      "  trim --min ${min_length} ${reads}",
      '  """',
      "}",
    ].join("\n"),
    "Trim reads",
    (stored) => ({
      ...stored,
      inputs: stored.inputs.map((input) =>
        input.name === "min_length"
          ? { ...input, settingType: "integer", defaultValue: "20" }
          : input,
      ),
      config: ["ext.args = '--quality 30'"],
    }),
  );
  const bamStats = customNode(
    readFileSync(
      join(
        __dirname,
        "../../src/test/fixtures/nfcore-bam_sort_stats_samtools.main.nf",
      ),
      "utf8",
    ),
    "BAM sort and stats",
  );
  registerCustomNodes([trimReads, bamStats]);

  const sheet = samplesheet();
  const reference = node("parameters", {
    parameters: [
      {
        name: "fasta",
        type: "file",
        value: "reference/genome.fasta",
        description: "Genome",
      },
    ],
    outputs: [{ name: "fasta", label: "fasta", isConnectable: true }],
  });
  const trim = node(trimReads.id);
  const stats = node(bamStats.id);
  const firstInput = (definitionNode: Node<NodeData>, index = 0) =>
    definitionNode.data.inputs?.[index]?.name ?? "in";
  return {
    name: "custom-nodes",
    description: "A custom process and a custom workflow node",
    nodes: [sheet, reference, trim, stats],
    edges: [
      edge(sheet, "samples", trim, firstInput(trim)),
      edge(trim, "reads", stats, firstInput(stats)),
      edge(reference, "fasta", stats, firstInput(stats, 1)),
    ],
  };
};

/**
 * FastQC and Trimmomatic nodes of workflows saved when they were built in,
 * as they load now: nf-core module nodes with their settings as arguments.
 */
const migratedNodes = (): LintFixture => {
  const input = node("fileInput", {
    files: [{ name: "reads.fastq", size: 4, content: "@r\nA\n+\nI\n" }],
  });
  const legacy = (id: string, data: Partial<NodeData>): Node<NodeData> =>
    migrateLegacyNfCoreNode({
      id,
      type: "process",
      position: { x: 0, y: 0 },
      data: { inputs: [{ name: "reads" }], ...data },
    });
  const fastqc = legacy("fastqc_legacy", {
    processType: "fastqc",
    label: "FastQC",
    outputs: [{ name: "html" }, { name: "zip" }, { name: "versions" }],
    nogroup: true,
    kmers: 7,
  });
  const trimmomatic = legacy("trimmomatic_legacy", {
    processType: "trimmomatic",
    label: "Trimmomatic",
    outputs: [{ name: "trimmed_reads" }, { name: "versions" }],
    leading: 3,
    adapter_file: "TruSeq3-SE.fa:2:30:10",
  });
  registerNfCoreNodes([fastqc, trimmomatic]);
  const outputName = (n: Node<NodeData>) => n.data.outputs?.[0]?.name ?? "out";
  return {
    name: "migrated-fastqc-trimmomatic",
    description: "FastQC and Trimmomatic nodes of workflows saved when they were built in",
    nodes: [input, fastqc, trimmomatic],
    edges: [
      edge(input, outputName(input), fastqc, "reads"),
      edge(input, outputName(input), trimmomatic, "reads"),
    ],
  };
};

/** A node of an nf-core module or subworkflow, registered from the catalog. */
const nfcore = (id: string, data: Partial<NodeData> = {}): Node<NodeData> => {
  const { modules, subworkflows } = catalog as unknown as {
    modules: NfCoreCatalogEntryForManifest[];
    subworkflows: NfCoreSubworkflowCatalogEntry[];
  };
  const subworkflow = subworkflows.find((candidate) => candidate.id === id);
  const module = modules.find((candidate) => candidate.id === id);
  if (!subworkflow && !module) throw new Error(`${id} is not in the nf-core catalog`);
  const definition = subworkflow
    ? createNodeDefinitionFromNfCoreSubworkflowManifest(buildNfCoreSubworkflowManifest(subworkflow))
    : createNodeDefinitionFromNfCoreManifest(buildNfCoreManifest(module as NfCoreCatalogEntryForManifest));
  registerDynamicNodeDefinitions([definition]);
  return node(definition.id, data);
};

/**
 * nf-core modules with other input shapes than the examples (see #165):
 * value inputs, optional inputs left open, several tuple inputs, files
 * gathered into one input, a folder output feeding a step, a compressed
 * input and stats collected into MultiQC.
 */
const nfCoreModuleShapes = (): LintFixture => {
  const sheet = samplesheet();
  const genome = node("fileInput", {
    files: [{ name: "genome.fa", size: 12, content: ">chr1\nACGTACGT\n" }],
  });
  const archive = node("fileInput", {
    files: [{ name: "genes.gtf.gz", size: 0, content: "" }],
  });
  // samtools/faidx: tuple with an optional fai, and a value (get_sizes).
  const faidx = nfcore("nf-core/samtools/faidx", { get_sizes: true });
  // bwa/index makes a folder that bwa/mem takes with reads and the genome.
  const bwaIndex = nfcore("nf-core/bwa/index");
  const bwaMem = nfcore("nf-core/bwa/mem", { sort_bam: true });
  const bamIndex = nfcore("nf-core/samtools/index");
  // cat/fastq gathers each sample's reads; seqkit/stats runs per sample.
  const catFastq = nfcore("nf-core/cat/fastq");
  const stats = nfcore("nf-core/seqkit/stats");
  const gunzip = nfcore("nf-core/gunzip");
  // MultiQC collects every sample's stats into one report.
  const multiqc = nfcore("nf-core/multiqc");
  const portOf = (target: Node<NodeData>, index: number) =>
    String(target.data.inputs?.[index]?.name);
  const outputOf = (source: Node<NodeData>, index = 0) =>
    String(source.data.outputs?.[index]?.name);
  return {
    name: "nfcore-module-shapes",
    description: "nf-core modules with value, optional, several and collected inputs",
    nodes: [sheet, genome, archive, faidx, bwaIndex, bwaMem, bamIndex, catFastq, stats, gunzip, multiqc],
    edges: [
      edge(genome, outputOf(genome), faidx, portOf(faidx, 0)),
      edge(genome, outputOf(genome), bwaIndex, portOf(bwaIndex, 0)),
      edge(sheet, "samples", bwaMem, "reads"),
      edge(bwaIndex, "index", bwaMem, "index"),
      edge(genome, outputOf(genome), bwaMem, "fasta"),
      edge(bwaMem, "bam", bamIndex, portOf(bamIndex, 0)),
      edge(sheet, "samples", catFastq, portOf(catFastq, 0)),
      edge(catFastq, "reads", stats, portOf(stats, 0)),
      edge(archive, outputOf(archive), gunzip, portOf(gunzip, 0)),
      edge(stats, "stats", multiqc, portOf(multiqc, 0)),
    ],
  };
};

/**
 * nf-core subworkflows with value settings, chained: fastp and FastQC
 * trimming feeding BWA alignment against an index a module makes.
 */
const nfCoreSubworkflowChain = (): LintFixture => {
  const sheet = samplesheet();
  const genome = node("fileInput", {
    files: [{ name: "genome.fa", size: 12, content: ">chr1\nACGTACGT\n" }],
  });
  const trim = nfcore("nf-core/subworkflows/fastq_trim_fastp_fastqc", {
    val_skip_fastqc: true,
  });
  const bwaIndex = nfcore("nf-core/bwa/index");
  const align = nfcore("nf-core/subworkflows/fastq_align_bwa", { val_sort_bam: false });
  const portOf = (target: Node<NodeData>, name: string) => {
    const port = target.data.inputs?.find((input) => input.name === name || input.name?.endsWith(name));
    if (!port) throw new Error(`${target.data.label} has no input ${name}`);
    return String(port.name);
  };
  const outputOf = (source: Node<NodeData>, name: string) => {
    const port = source.data.outputs?.find((output) => output.name === name);
    if (!port) throw new Error(`${source.data.label} has no output ${name}`);
    return String(port.name);
  };
  return {
    name: "nfcore-subworkflow-chain",
    description: "Trimming subworkflow into an alignment subworkflow, with an index from a module",
    nodes: [sheet, genome, trim, bwaIndex, align],
    edges: [
      edge(sheet, "samples", trim, portOf(trim, "ch_reads")),
      edge(trim, outputOf(trim, "reads"), align, portOf(align, "ch_reads")),
      edge(genome, String(genome.data.outputs?.[0]?.name), bwaIndex, String(bwaIndex.data.inputs?.[0]?.name)),
      edge(bwaIndex, "index", align, portOf(align, "ch_index")),
    ],
  };
};

export const buildLintFixtures = (): LintFixture[] => {
  const starSalmon = rnaseqStarSalmon as unknown as {
    nodes: Node<NodeData>[];
    edges: Edge[];
  };
  registerNfCoreNodes(starSalmon.nodes);
  const qcFastq = qcFastqTemplate as unknown as {
    name: string;
    nodes: Node<NodeData>[];
    edges: Edge[];
  };
  registerNfCoreNodes(qcFastq.nodes);
  return [
    {
      name: "demo-1-text-basics",
      description: demoWorkflowSeed.name,
      nodes: demoWorkflowSeed.nodes as Node<NodeData>[],
      edges: demoWorkflowSeed.edges as Edge[],
    },
    {
      name: "demo-3-rnaseq-from-nodes",
      description: "Demo 3 - nf-core/rnaseq rebuilt from nodes",
      nodes: starSalmon.nodes,
      edges: starSalmon.edges,
    },
    {
      name: "template-qc-fastq",
      description: `Template: ${qcFastq.name}`,
      nodes: qcFastq.nodes,
      edges: qcFastq.edges,
    },
    channelOperators(),
    customNodes(),
    migratedNodes(),
    nfCoreModuleShapes(),
    nfCoreSubworkflowChain(),
  ];
};
