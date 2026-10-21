Every node from the **+** (*Add node*) menu, by kind. Double-click a node to open its panel:
**Settings**, **Code** (the Nextflow it adds) and **Results** (what its tasks produced in the
last run). Every node also has a **Label**.

**Kinds:** [Inputs](#inputs) · [Operators](#operators) · [nf-core steps](#nf-core-steps) ·
[Custom steps](#custom-steps) · [Output](#output) · [Note](#note)

## Inputs

### File Input

Files from your computer. Click **Upload File(s)** on the node, or drop files into its panel,
which also lists, selects and removes them. A file with the same name replaces the old one.
Files up to 256 KB are saved with the workflow; larger ones must be uploaded again after a
reload. Binary files such as `.fastq.gz` arrive unchanged.

### Samplesheet

An nf-core-style samplesheet (`sample,fastq_1,fastq_2,…`), typed in, loaded from a `.csv`
or started from the **rnaseq template**. Each row becomes one sample, as nf-core modules
expect it: `[ meta, [ reads ] ]`. Choose which columns hold the sample id and the reads; the
panel lists the parsed samples and any problems. Reads are names of files uploaded to a File
Input, URLs, or (where Nextflow runs on the computer itself) absolute paths.

### Parameters

Named values (**Text**, **Number**, **True/false**) and **Reference files** such as a genome
FASTA, GTF or index. Each becomes `params.<name>`, so it can be changed when the exported
project runs (`--fasta …`), and node settings can use it as `${params.name}`. Every reference
file is an output to connect; its value is an uploaded file name, a path or a URL.

## Operators

### Filter

Keeps the lines of text files that match **Filter Text**: **Contains**, **Starts With**,
**Ends With** or **Matches (Regex)**; upper and lower case count as different. **Negate**
keeps the other lines. **File Selection** limits it to some of the incoming files (none ticked: all).

### Map

Changes text: **Change Case** (upper or lower case) or **Replace Text** (**Find** →
**Replace With**).

### Merge

Joins the files it receives into one, with a **Separator** between them. Its input takes any
number of connections.

### Channel Operator

Nextflow channel code between nodes, for what plain connections can't do: join a BAM with its
index by sample, mix reports for MultiQC, branch, combine, group or collect. Start from a
**Template** and edit the **Channel code**; it reads `input.<port>` and assigns
`output.<port>`. The ports are set in **Inputs** and **Outputs**.

## nf-core steps

Installed from the [nf-core library](https://github.com/HCIstudio/N-WAVE/wiki/nf-core-Library).

### nf-core module

One tool, such as FastQC, Trim Galore or STAR. Its ports are the module's inputs and outputs,
explained under **About this nf-core module** with links to its documentation. Settings:

- **Module inputs**: the values the module takes.
- **Extra arguments**: options passed to the tool (`ext.args`).
- **Output prefix**: the output file names; `${meta.id}` is the sample.
- **Save outputs**: copies the outputs to `results/<node name>/` (on by default).
- **Resources**: CPUs, memory and time for this step (**Override defaults**).

### nf-core subworkflow

Several modules wired together by nf-core, such as `bam_sort_stats_samtools`. Its settings are
the subworkflow's values, what an unconnected input gets, **Process config** for the processes
inside, and **Save outputs**.

### nf-core Pipeline

A complete nf-core pipeline, such as nf-core/rnaseq, run unchanged. The workflow then runs
that pipeline instead of a generated script, so it holds only the Pipeline node and the
inputs feeding it (Samplesheet, Parameters, File Input). Its settings come from the
pipeline's parameter schema; **Use the pipeline's test profile** runs it on its own test data.
See [Running the nf-core/rnaseq example](https://github.com/HCIstudio/N-WAVE/wiki/Running-the-nf-core-rnaseq-Example).

## Custom steps

Your own processes, made in the **Custom process** editor or with **Convert to custom node**
on any node's **Code** tab. Their settings are the ones you declared. See
[Custom nodes](https://github.com/HCIstudio/N-WAVE/wiki/Custom-Nodes) and
[Node packs](https://github.com/HCIstudio/N-WAVE/wiki/Node-Packs).

## Output

### Display Output

Shows what reaches it. After a run, **Results of the last run** shows the real files; choose
one under **View File** or all of them, and download it as text, CSV or JSON.

## Note

Text on the canvas that explains the workflow. Notes have no ports and add no code.
