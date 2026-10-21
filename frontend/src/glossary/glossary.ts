// Short explanations of the terms N-WAVE's screens use, for people new to
// Nextflow and bioinformatics. Shown next to the terms (<Term>) and collected
// on the glossary page.

export interface GlossaryEntry {
  id: string;
  term: string;
  /** One or two plain sentences. */
  definition: string;
  /** Other entries that help understand this one. */
  related?: GlossaryId[];
}

const entries = [
  {
    id: "node",
    term: "Node",
    definition:
      "A box on the canvas: an input, a tool, an operator or an output. Connect nodes to pass data from one to the next.",
    related: ["port", "process"],
  },
  {
    id: "port",
    term: "Port",
    definition:
      "The dots on a node's sides: inputs on the left, outputs on the right. A connection runs from an output to an input. Most inputs take one connection; a taller one takes any number.",
    related: ["node", "channel"],
  },
  {
    id: "process",
    term: "Process",
    definition:
      "Nextflow's word for a step that runs a command or script on its inputs and writes output files. Each tool node becomes a process, which runs once per sample.",
    related: ["task", "module", "custom-process"],
  },
  {
    id: "task",
    term: "Task",
    definition:
      "One run of a process on one set of inputs, such as FastQC on one sample. Tasks run in parallel, each in a work directory of its own.",
    related: ["process", "work-directory"],
  },
  {
    id: "channel",
    term: "Channel",
    definition:
      "The stream of data along a connection: files, samples or values, one item after another. A process runs once for each item it receives.",
    related: ["channel-operator", "tuple"],
  },
  {
    id: "channel-operator",
    term: "Channel operator",
    definition:
      "A node that reshapes channels without running a tool: filter, change, combine or mix their items, for example to collect every report for MultiQC.",
    related: ["channel"],
  },
  {
    id: "tuple",
    term: "Tuple",
    definition:
      "Several values that travel together as one item of a channel, such as [ meta, reads ]: a sample's details and its files.",
    related: ["meta", "channel"],
  },
  {
    id: "meta",
    term: "meta",
    definition:
      "The sample details nf-core modules pass along with a sample's files: meta.id (the sample name), meta.single_end and the other samplesheet columns. Output files are named after meta.id.",
    related: ["tuple", "samplesheet"],
  },
  {
    id: "samplesheet",
    term: "Samplesheet",
    definition:
      "A CSV table with one row per sample: its name and the paths or URLs of its FASTQ files. The Samplesheet node turns each row into [ meta, reads ].",
    related: ["meta", "fastq", "paired-end"],
  },
  {
    id: "fastq",
    term: "FASTQ",
    definition:
      "The file format of sequencing reads: each read's sequence with a quality score per base, often gzipped (.fastq.gz).",
    related: ["paired-end", "samplesheet"],
  },
  {
    id: "paired-end",
    term: "Paired-end and single-end",
    definition:
      "Paired-end sequencing reads each DNA fragment from both ends, giving two FASTQ files per sample (_1 and _2); single-end gives one.",
    related: ["fastq"],
  },
  {
    id: "parameters",
    term: "Parameters",
    definition:
      "Named values a workflow reads, such as the path or URL of a reference genome. The Parameters node lists them and connects each to the nodes that use it.",
    related: ["reference-genome"],
  },
  {
    id: "reference-genome",
    term: "Reference genome",
    definition:
      "The genome sequence (FASTA) and gene annotation (GTF) of the organism the reads come from. Reads are aligned to it, and indexes are built from it.",
    related: ["index", "parameters"],
  },
  {
    id: "index",
    term: "Index",
    definition:
      "A file or folder a tool builds once from the reference genome so it can search it quickly, such as STAR's genome index. One node builds it; aligners take it as an input.",
    related: ["reference-genome"],
  },
  {
    id: "container",
    term: "Container",
    definition:
      "A packaged environment holding a tool and everything it needs, so the same version runs on every computer. Each nf-core module names the container of its tool.",
    related: ["docker", "module"],
  },
  {
    id: "docker",
    term: "Docker",
    definition:
      "The program that runs containers. With Docker turned on in the execution settings, each step runs in its tool's container instead of needing the tool installed.",
    related: ["container"],
  },
  {
    id: "nextflow",
    term: "Nextflow",
    definition:
      "The workflow language and engine N-WAVE writes code for and runs. The Code tab of a node shows the Nextflow it adds.",
    related: ["process", "channel"],
  },
  {
    id: "nf-core",
    term: "nf-core",
    definition:
      "A community collection of tested Nextflow pipelines, modules and subworkflows for bioinformatics. N-WAVE installs them from its nf-core Library.",
    related: ["module", "subworkflow", "pipeline"],
  },
  {
    id: "module",
    term: "Module",
    definition:
      "One nf-core tool, such as FastQC or STAR, packaged as a process with its container. Installed from the nf-core Library, it becomes a node.",
    related: ["nf-core", "process", "container"],
  },
  {
    id: "subworkflow",
    term: "Subworkflow",
    definition:
      "Several nf-core modules wired together as one node, such as sorting, indexing and collecting statistics of alignments.",
    related: ["module", "pipeline"],
  },
  {
    id: "pipeline",
    term: "Pipeline",
    definition:
      "A complete nf-core workflow, such as nf-core/rnaseq, run as one node with its own settings and reports.",
    related: ["nf-core", "subworkflow"],
  },
  {
    id: "ext-args",
    term: "Extra arguments (ext.args)",
    definition:
      "Command-line options added to a module's tool, as written in the tool's documentation. nf-core modules read them from task.ext.args.",
    related: ["module"],
  },
  {
    id: "versions",
    term: "Versions output",
    definition:
      "An output every nf-core module has: the versions of the tools it ran, for MultiQC's software report. It isn't data for the next step.",
    related: ["module"],
  },
  {
    id: "custom-process",
    term: "Custom process",
    definition:
      "A node you write yourself: a Nextflow process with your own inputs, outputs and script, for a tool that isn't in the nf-core Library.",
    related: ["process"],
  },
  {
    id: "work-directory",
    term: "Work directory",
    definition:
      "Where Nextflow runs each task, in a folder of its own. The files a node saves are copied from there to results/<node name>.",
    related: ["task"],
  },
] as const satisfies ReadonlyArray<Omit<GlossaryEntry, "related"> & { related?: readonly string[] }>;

export type GlossaryId = (typeof entries)[number]["id"];

/** Every entry, alphabetically. */
export const GLOSSARY: GlossaryEntry[] = [...(entries as unknown as GlossaryEntry[])].sort((a, b) =>
  a.term.localeCompare(b.term, "en", { sensitivity: "base" }),
);

export const glossaryEntry = (id: GlossaryId): GlossaryEntry =>
  GLOSSARY.find((entry) => entry.id === id) as GlossaryEntry;
