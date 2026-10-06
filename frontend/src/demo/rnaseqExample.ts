// Built-in example: nf-core/rnaseq 3.27.0 as a Pipeline node, preset to the
// pipeline's own small test data, with notes on the canvas that explain it.
//
// The backend serves the same workflow from
// backend/src/workflows/library/assets/rnaseq_pipeline_example.json; a unit
// test (rnaseqExample.test.ts) keeps the two identical.

export const RNASEQ_EXAMPLE_ID = "builtin:rnaseq-pipeline";

const TEST_DATA =
  "https://raw.githubusercontent.com/nf-core/test-datasets/rnaseq/testdata/GSE110004";
const TEST_REFERENCE =
  "https://raw.githubusercontent.com/nf-core/test-datasets/626c8fab639062eade4b10747e919341cbf9b41a/reference";

/** The pipeline's test samplesheet (samplesheet/v3.10/samplesheet_test.csv). */
const TEST_SAMPLESHEET = [
  "sample,fastq_1,fastq_2,strandedness",
  `WT_REP1,${TEST_DATA}/SRR6357070_1.fastq.gz,${TEST_DATA}/SRR6357070_2.fastq.gz,auto`,
  `WT_REP1,${TEST_DATA}/SRR6357071_1.fastq.gz,${TEST_DATA}/SRR6357071_2.fastq.gz,auto`,
  `WT_REP2,${TEST_DATA}/SRR6357072_1.fastq.gz,${TEST_DATA}/SRR6357072_2.fastq.gz,reverse`,
  `RAP1_UNINDUCED_REP1,${TEST_DATA}/SRR6357073_1.fastq.gz,,reverse`,
  `RAP1_UNINDUCED_REP2,${TEST_DATA}/SRR6357074_1.fastq.gz,,reverse`,
  `RAP1_UNINDUCED_REP2,${TEST_DATA}/SRR6357075_1.fastq.gz,,reverse`,
  `RAP1_IAA_30M_REP1,${TEST_DATA}/SRR6357076_1.fastq.gz,${TEST_DATA}/SRR6357076_2.fastq.gz,reverse`,
  "",
].join("\n");

const note = (
  id: string,
  position: { x: number; y: number },
  label: string,
  noteText: string,
) => ({
  id,
  type: "note",
  position,
  data: { label, icon: "StickyNote", noteText, inputs: [], outputs: [] },
});

const port = (name: string) => ({
  name,
  label: `--${name}`,
  isConnectable: true,
});

const rnaseqExampleNodes = [
  note(
    "rnaseq-note-start",
    { x: 80, y: -200 },
    "Start here: nf-core/rnaseq example",
    [
      "This workflow runs the complete nf-core/rnaseq 3.27.0 pipeline: read QC, trimming, alignment with STAR, quantification with Salmon, and a MultiQC report.",
      "",
      "It is preset to the pipeline's small test data (yeast reads, downloaded on the fly), so it runs as it is. Duplicate it to change anything.",
    ].join("\n"),
  ),
  {
    id: "rnaseq-samplesheet",
    type: "samplesheet",
    position: { x: 80, y: 120 },
    data: {
      label: "Samplesheet",
      icon: "Sheet",
      subtitle: "7 samples, 4 paired-end",
      samplesheet: TEST_SAMPLESHEET,
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
    id: "rnaseq-references",
    type: "parameters",
    position: { x: 80, y: 340 },
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
          value: `${TEST_REFERENCE}/genes_with_empty_tid.gtf.gz`,
          description: "Gene annotation (GTF)",
        },
      ],
      outputs: [
        { name: "fasta", label: "fasta", isConnectable: true },
        { name: "gtf", label: "gtf", isConnectable: true },
      ],
    },
  },
  {
    id: "rnaseq-pipeline",
    type: "pipeline",
    position: { x: 480, y: 200 },
    data: {
      label: "nf-core/rnaseq",
      icon: "Workflow",
      subtitle: "nf-core/rnaseq 3.27.0",
      pipelineName: "rnaseq",
      pipelineVersion: "3.27.0",
      pipelineTestProfile: true,
      pipelineValues: {},
      inputs: [port("input"), port("fasta"), port("gtf")],
      outputs: [],
    },
  },
  note(
    "rnaseq-note-samples",
    { x: -260, y: 60 },
    "Samples",
    [
      "The samplesheet lists the sequencing runs: one row per FASTQ file or pair. 'sample' groups runs of the same sample (WT_REP1 has two), 'fastq_2' is empty for single-end reads, and 'strandedness' is auto, forward, unstranded or reverse.",
      "",
      "Your own data: replace the rows, or upload the FASTQ files to a File Input node and refer to them by name.",
    ].join("\n"),
  ),
  note(
    "rnaseq-note-references",
    { x: -260, y: 360 },
    "Reference genome",
    [
      "The genome sequence (--fasta) and its gene annotation (--gtf). The pipeline builds the STAR and Salmon indexes from them.",
      "",
      "Your own data: set both to the URL or path of your organism's files (e.g. from Ensembl or GENCODE), or upload them and use the file names.",
    ].join("\n"),
  ),
  note(
    "rnaseq-note-pipeline",
    { x: 480, y: 440 },
    "Pipeline settings",
    [
      "Double-click the pipeline to see all its parameters. 'Use the pipeline's test profile' is on: it fills in the test data's other settings. Turn it off when you use your own samples and genome.",
      "",
      "The default aligner is STAR with Salmon quantification (--aligner star_salmon).",
    ].join("\n"),
  ),
  note(
    "rnaseq-note-resources",
    { x: 860, y: 0 },
    "Running it",
    [
      "Needs the Docker install of N-WAVE (the browser demo can only build and export). Its first run downloads several GB of containers.",
      "",
      "Resources: the run is limited to 4 CPUs and 8 GB of memory (Execution settings > Resources); the test data needs at least 6 GB. Expect 15–30 minutes on a laptop.",
      "",
      "Export project gives you a folder with run.sh to run it anywhere with Nextflow and Docker.",
    ].join("\n"),
  ),
  note(
    "rnaseq-note-results",
    { x: 860, y: 320 },
    "Results",
    [
      "When the run finishes, double-click the pipeline node: its Results section links the reports. Open multiqc_report.html for the summary of every sample (QC, alignment rates, counts).",
      "",
      "Gene counts are in star_salmon/salmon.merged.gene_counts.tsv.",
    ].join("\n"),
  ),
];

const rnaseqExampleEdges = [
  {
    id: "rnaseq-edge-samplesheet",
    source: "rnaseq-samplesheet",
    sourceHandle: "samples",
    target: "rnaseq-pipeline",
    targetHandle: "input",
    type: "default",
  },
  {
    id: "rnaseq-edge-fasta",
    source: "rnaseq-references",
    sourceHandle: "fasta",
    target: "rnaseq-pipeline",
    targetHandle: "fasta",
    type: "default",
  },
  {
    id: "rnaseq-edge-gtf",
    source: "rnaseq-references",
    sourceHandle: "gtf",
    target: "rnaseq-pipeline",
    targetHandle: "gtf",
    type: "default",
  },
];

export const rnaseqExampleSeed = {
  id: RNASEQ_EXAMPLE_ID,
  name: "nf-core/rnaseq Example",
  description:
    "Runs the full nf-core/rnaseq 3.27.0 pipeline (STAR + Salmon) on its small test data. Notes on the canvas explain each input and how to use your own data. Duplicate it to edit.",
  nodes: rnaseqExampleNodes,
  edges: rnaseqExampleEdges,
  /** Overrides of the default execution settings' resources. */
  resources: { maxCpus: 4, maxMemory: "8.GB" },
};
