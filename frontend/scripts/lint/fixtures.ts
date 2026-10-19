// Workflows whose generated Nextflow is linted in CI (see README.md here):
// the built-in examples, and node combinations the examples don't cover.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Edge, Node } from "reactflow";
import type { NodeData } from "../../src/components/nodes/BaseNode";
import { demoWorkflowSeed } from "../../src/demo/demoWorkflow";
import rnaseqStarSalmon from "../../src/demo/rnaseqStarSalmonExample.json";
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

export const buildLintFixtures = (): LintFixture[] => {
  const starSalmon = rnaseqStarSalmon as unknown as {
    nodes: Node<NodeData>[];
    edges: Edge[];
  };
  registerNfCoreNodes(starSalmon.nodes);
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
    channelOperators(),
    customNodes(),
    migratedNodes(),
  ];
};
