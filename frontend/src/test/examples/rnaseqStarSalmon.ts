// Builds the "RNA-seq (STAR + Salmon)" example: the default nf-core/rnaseq
// route (genome preparation, FastQC, Trim Galore, STAR, Salmon, SAMtools,
// MultiQC) from library nodes only: installed nf-core modules and a
// subworkflow, a channel operator, a samplesheet and a parameters node.
//
// The nodes are created from the pinned nf-core catalog the way the node
// menu creates them, so the stored example matches what a user would build.
// Only tests import this (it lives in src/test and loads the whole catalog); the stored copies are
// frontend/src/demo/rnaseqStarSalmonExample.json and
// backend/src/workflows/library/assets/rnaseq_star_salmon_example.json, kept
// in sync by rnaseqStarSalmon.test.ts.

import type { Edge, Node } from "reactflow";
import type { NodeData } from "../../components/nodes/BaseNode";
import "../../registry/nodeDefinitions";
import catalog from "../../registry/nfcore/catalog.json";
import {
  buildNfCoreManifest,
  type NfCoreCatalogEntryForManifest,
} from "../../registry/nfcore/manifest";
import {
  buildNfCoreSubworkflowManifest,
  createNodeDefinitionFromNfCoreSubworkflowManifest,
  type NfCoreSubworkflowCatalogEntry,
} from "../../registry/nfcore/subworkflow";
import { createNodeDefinitionFromNfCoreManifest } from "../../registry/nfcoreModuleAdapters";
import type { NodeDefinition } from "../../registry/nodeDefinitions";

export const RNASEQ_STAR_SALMON_ID = "builtin:rnaseq-star-salmon";

const TEST_DATA =
  "https://raw.githubusercontent.com/nf-core/test-datasets/rnaseq/testdata/GSE110004";
const TEST_REFERENCE =
  "https://raw.githubusercontent.com/nf-core/test-datasets/626c8fab639062eade4b10747e919341cbf9b41a/reference";

/**
 * Four samples from the nf-core/rnaseq test samplesheet, one run each
 * (the full pipeline also merges several runs of a sample).
 */
const SAMPLESHEET = [
  "sample,fastq_1,fastq_2,strandedness",
  `WT_REP1,${TEST_DATA}/SRR6357070_1.fastq.gz,${TEST_DATA}/SRR6357070_2.fastq.gz,auto`,
  `WT_REP2,${TEST_DATA}/SRR6357072_1.fastq.gz,${TEST_DATA}/SRR6357072_2.fastq.gz,reverse`,
  `RAP1_UNINDUCED_REP1,${TEST_DATA}/SRR6357073_1.fastq.gz,,reverse`,
  `RAP1_IAA_30M_REP1,${TEST_DATA}/SRR6357076_1.fastq.gz,${TEST_DATA}/SRR6357076_2.fastq.gz,reverse`,
  "",
].join("\n");

/** STAR options of nf-core/rnaseq 3.27.0 (conf/modules/align_star.config, salmon route). */
export const STAR_ALIGN_ARGS = [
  "--quantMode TranscriptomeSAM",
  "--outSAMtype BAM Unsorted",
  "--outSAMattributes NH HI AS NM MD",
  "--readFilesCommand zcat",
  "--twopassMode Basic",
  "--runRNGseed 0",
  "--outFilterMultimapNmax 20",
  "--alignSJDBoverhangMin 1",
  "--outSAMstrandField intronMotif",
  "--quantTranscriptomeSAMoutput BanSingleEnd",
].join(" ");

const modules = (catalog as { modules: NfCoreCatalogEntryForManifest[] })
  .modules;
const subworkflows = (
  catalog as unknown as { subworkflows: NfCoreSubworkflowCatalogEntry[] }
).subworkflows;

const moduleDefinition = (id: string): NodeDefinition => {
  const entry = modules.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`${id} is not in the nf-core catalog`);
  return createNodeDefinitionFromNfCoreManifest(buildNfCoreManifest(entry));
};

const subworkflowDefinition = (id: string): NodeDefinition => {
  const entry = subworkflows.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`${id} is not in the nf-core catalog`);
  return createNodeDefinitionFromNfCoreSubworkflowManifest(
    buildNfCoreSubworkflowManifest(entry),
  );
};

type Position = { x: number; y: number };

/** A canvas node made from a definition, as the node menu makes it. */
const fromDefinition = (
  id: string,
  definition: NodeDefinition,
  position: Position,
  data: Partial<NodeData> = {},
): Node<NodeData> => ({
  id,
  type: definition.type,
  position,
  data: {
    label: definition.label,
    icon: definition.icon,
    ...definition.defaults,
    ...data,
  } as NodeData,
});

const note = (
  id: string,
  position: Position,
  label: string,
  noteText: string,
) => ({
  id,
  type: "note",
  position,
  data: { label, icon: "StickyNote", noteText, inputs: [], outputs: [] },
});

const edge = (
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): Edge => ({
  id: `edge-${source}-${sourceHandle}-${target}-${targetHandle}`,
  source,
  sourceHandle,
  target,
  targetHandle,
  type: "default",
});

/** The nf-core components the example's nodes come from. */
export const RNASEQ_STAR_SALMON_COMPONENTS = [
  "nf-core/gunzip",
  "nf-core/custom/gtffilter",
  "nf-core/gffread",
  "nf-core/star/genomegenerate",
  "nf-core/salmon/index",
  "nf-core/fastqc",
  "nf-core/trimgalore",
  "nf-core/star/align",
  "nf-core/salmon/quant",
  "nf-core/subworkflows/bam_sort_stats_samtools",
  "nf-core/multiqc",
];

export const buildRnaseqStarSalmonExample = () => {
  const [
    gunzip,
    gtfFilter,
    gffread,
    starIndex,
    salmonIndex,
    fastqc,
    trimgalore,
    starAlign,
    salmonQuant,
  ] = RNASEQ_STAR_SALMON_COMPONENTS.slice(0, 9).map(moduleDefinition);
  const bamSortStats = subworkflowDefinition(
    "nf-core/subworkflows/bam_sort_stats_samtools",
  );
  const multiqc = moduleDefinition("nf-core/multiqc");

  const nodes = [
    {
      id: "samples",
      type: "samplesheet",
      position: { x: 0, y: 120 },
      data: {
        label: "Samplesheet",
        icon: "Sheet",
        subtitle: "4 samples, 3 paired-end",
        samplesheet: SAMPLESHEET,
        samplesheetFileName: "samplesheet.csv",
        samplesheetMapping: {
          idColumn: "sample",
          read1Column: "fastq_1",
          read2Column: "fastq_2",
        },
        outputs: [{ name: "samples", label: "Samples", isConnectable: true }],
      },
    },
    {
      id: "reference",
      type: "parameters",
      position: { x: 0, y: 620 },
      data: {
        label: "Reference genome",
        icon: "Settings2",
        subtitle: "2 references",
        parameters: [
          {
            name: "fasta",
            type: "file",
            value: `${TEST_REFERENCE}/genome.fasta`,
            description: "Genome sequence (FASTA)",
          },
          {
            name: "gtf",
            type: "file",
            value: `${TEST_REFERENCE}/genes.gtf.gz`,
            description: "Gene annotation (GTF, gzipped)",
          },
        ],
        outputs: [
          { name: "fasta", label: "fasta", isConnectable: true },
          { name: "gtf", label: "gtf", isConnectable: true },
        ],
      },
    },
    // Genome preparation
    fromDefinition(
      "gunzip_gtf",
      gunzip,
      { x: 380, y: 760 },
      {
        label: "Unzip GTF",
      },
    ),
    fromDefinition(
      "gtf_filter",
      gtfFilter,
      { x: 380, y: 1000 },
      {
        label: "Filter GTF",
        // The output would otherwise overwrite its input (genes.gtf).
        nfcoreExtPrefix: "${meta.id}.filtered",
      },
    ),
    fromDefinition(
      "transcripts_fasta",
      gffread,
      { x: 760, y: 900 },
      {
        label: "Transcript FASTA",
        nfcoreExtArgs: "-w",
      },
    ),
    fromDefinition(
      "star_index",
      starIndex,
      { x: 760, y: 600 },
      {
        label: "STAR index",
        nfcoreExtArgs: "--genomeSAindexNbases 7",
      },
    ),
    fromDefinition(
      "salmon_index",
      salmonIndex,
      { x: 1140, y: 900 },
      {
        label: "Salmon index",
      },
    ),
    // Reads
    fromDefinition(
      "fastqc_raw",
      fastqc,
      { x: 380, y: -120 },
      {
        label: "FastQC (raw reads)",
      },
    ),
    fromDefinition(
      "trim_galore",
      trimgalore,
      { x: 380, y: 160 },
      {
        label: "Trim Galore",
      },
    ),
    fromDefinition(
      "star_align",
      starAlign,
      { x: 1140, y: 220 },
      {
        label: "STAR alignment",
        nfcoreExtArgs: STAR_ALIGN_ARGS,
      },
    ),
    fromDefinition(
      "salmon_quant",
      salmonQuant,
      { x: 1520, y: 520 },
      {
        label: "Salmon quantification",
        nfcoreExtArgs: "--libType A",
      },
    ),
    fromDefinition(
      "bam_sort_stats",
      bamSortStats,
      { x: 1520, y: 120 },
      {
        label: "SAMtools sort, index, stats",
      },
    ),
    {
      id: "qc_reports",
      type: "channelOperator",
      position: { x: 1900, y: 220 },
      data: {
        label: "Collect QC reports",
        icon: "GitMerge",
        subtitle: "Mix",
        channelOperatorTemplate: "custom",
        channelOperatorCode: [
          "// Every report MultiQC reads, as one channel.",
          "output.reports = input.fastqc.mix(",
          "    input.trimming,",
          "    input.star,",
          "    input.salmon,",
          "    input.samtools_stats,",
          "    input.samtools_flagstat,",
          "    input.samtools_idxstats",
          ")",
        ].join("\n"),
        inputs: [
          "fastqc",
          "trimming",
          "star",
          "salmon",
          "samtools_stats",
          "samtools_flagstat",
          "samtools_idxstats",
        ].map((name) => ({ name, label: name, isConnectable: true })),
        outputs: [{ name: "reports", label: "reports", isConnectable: true }],
      },
    },
    fromDefinition(
      "multiqc",
      multiqc,
      { x: 2280, y: 220 },
      {
        label: "MultiQC",
      },
    ),
    note(
      "note_start",
      { x: 0, y: -330 },
      "RNA-seq (STAR + Salmon), built from library nodes",
      [
        "The default route of nf-core/rnaseq, rebuilt step by step from nf-core modules: read QC and trimming, STAR alignment, Salmon quantification, SAMtools statistics and a MultiQC report.",
        "",
        "Every node is a library node. Double-click one to see its settings, and open its Code tab for the Nextflow code it adds. Duplicate the workflow to change anything.",
      ].join("\n"),
    ),
    note(
      "note_inputs",
      { x: -360, y: 380 },
      "Inputs",
      [
        "Samplesheet: four samples from the nf-core/rnaseq test data (yeast), three paired-end and one single-end. The reads are downloaded on the fly.",
        "",
        "Reference genome: the test genome (FASTA) and gene annotation (GTF). Swap in your own files or URLs to analyse other data.",
      ].join("\n"),
    ),
    note(
      "note_genome",
      { x: 760, y: 1120 },
      "Genome preparation",
      [
        "As in nf-core/rnaseq: unzip the GTF, drop annotation on sequences that aren't in the genome, write the transcript sequences (gffread -w), and build the STAR and Salmon indexes.",
        "",
        "The STAR index uses --genomeSAindexNbases 7 because the test genome is tiny (230 kb); remove it for a real genome.",
      ].join("\n"),
    ),
    note(
      "note_quant",
      { x: 1520, y: 760 },
      "Alignment and quantification",
      [
        "STAR aligns the trimmed reads with the options nf-core/rnaseq uses and also writes alignments to the transcriptome. Salmon quantifies those (alignment mode, --libType A detects the strandedness).",
        "",
        "SAMtools sorts and indexes the genome alignments and collects statistics.",
      ].join("\n"),
    ),
    note(
      "note_results",
      { x: 2280, y: -220 },
      "Results",
      [
        "Run it on the Docker install (the browser demo builds and exports only). Each node saves its outputs to results/<node name>: Salmon quantifications in results/salmon_quantification/<sample>/quant.sf, the report in results/multiqc/multiqc_report.html.",
        "",
        "Collect QC reports is a channel operator that mixes every report into one channel for MultiQC.",
      ].join("\n"),
    ),
    note(
      "note_scope",
      { x: 1900, y: 760 },
      "What the full pipeline adds",
      [
        "nf-core/rnaseq also merges runs of the same sample, infers strandedness, removes rRNA and contaminants, offers other aligners (HISAT2, RSEM, Bowtie 2, Kallisto) and UMI handling, adds QC (RSeQC, Qualimap, dupRadar, Preseq) and builds gene-level count matrices. Use the nf-core/rnaseq Example to run all of it.",
      ].join("\n"),
    ),
  ] as Node<NodeData>[];

  const edges: Edge[] = [
    edge("reference", "gtf", "gunzip_gtf", "archive"),
    edge("gunzip_gtf", "gunzip", "gtf_filter", "gtf"),
    edge("reference", "fasta", "gtf_filter", "fasta"),
    edge("gtf_filter", "gtf", "transcripts_fasta", "gff"),
    edge("reference", "fasta", "transcripts_fasta", "fasta"),
    edge("reference", "fasta", "star_index", "fasta"),
    edge("gtf_filter", "gtf", "star_index", "gtf"),
    edge(
      "transcripts_fasta",
      "gffread_fasta",
      "salmon_index",
      "transcript_fasta",
    ),
    edge("reference", "fasta", "salmon_index", "genome_fasta"),
    edge("samples", "samples", "fastqc_raw", "reads"),
    edge("samples", "samples", "trim_galore", "reads"),
    edge("trim_galore", "reads", "star_align", "reads"),
    edge("star_index", "index", "star_align", "index"),
    edge("gtf_filter", "gtf", "star_align", "gtf"),
    edge("star_align", "bam_transcript", "salmon_quant", "reads"),
    edge("salmon_index", "index", "salmon_quant", "index"),
    edge("gtf_filter", "gtf", "salmon_quant", "gtf"),
    edge(
      "transcripts_fasta",
      "gffread_fasta",
      "salmon_quant",
      "transcript_fasta",
    ),
    edge("star_align", "bam", "bam_sort_stats", "ch_bam"),
    edge("fastqc_raw", "zip", "qc_reports", "fastqc"),
    edge("trim_galore", "log", "qc_reports", "trimming"),
    edge("star_align", "log_final", "qc_reports", "star"),
    edge("salmon_quant", "results", "qc_reports", "salmon"),
    edge("bam_sort_stats", "stats", "qc_reports", "samtools_stats"),
    edge("bam_sort_stats", "flagstat", "qc_reports", "samtools_flagstat"),
    edge("bam_sort_stats", "idxstats", "qc_reports", "samtools_idxstats"),
    edge("qc_reports", "reports", "multiqc", "multiqc_files"),
  ];

  const definitions = [
    gunzip,
    gtfFilter,
    gffread,
    starIndex,
    salmonIndex,
    fastqc,
    trimgalore,
    starAlign,
    salmonQuant,
    bamSortStats,
    multiqc,
  ];
  return { nodes, edges, definitions };
};
