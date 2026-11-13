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

## Branches (if / else if / else)

A **Branch** runs one of several sets of steps, chosen by conditions on the workflow's
parameters: the first arm whose condition holds runs, and when none does, the **else** arm
(which may have no steps). It is how nf-core pipelines choose a tool (`aligner`) or skip a step
(`skip_qc`). Branches are **Logic** nodes (fuchsia, a diamond in the previews): they run no
tool and change no data, they decide which steps run.

**On the canvas**

- The Branch node lists its arms: **if** with its condition, each **else if** with its own,
  and **else**. The arm that runs with the Parameters node's values now says **runs now**; the
  others are greyed out, and so are their steps. A dashed fuchsia line comes in from the
  Parameters node the conditions read.
- Each arm's exit has its color (if green, else if sky, indigo or teal, else amber). Dashed
  lines in that color lead to the arm's steps, and a lane of that color frames them.
- Where the arms meet again, the next step has a connection from each arm into the same input.
  Only one arm runs, so it counts as one connection (the workflow check doesn't flag it).
- A connection that holds in one arm only, a channel from before the branch that the arm passes
  on (`else { ch_reads_out = ch_reads }`), is dashed in the arm's color.
- A branch can be in an arm of another branch (nested). Its steps are in both.

**Building one**

1. In the + menu, under **Branches**: **If / else** (one condition), **If / else if / else**
   (two to start with) or **Switch on a parameter** (one arm per value of a parameter).
2. Double-click it to write the conditions (`params.aligner == 'star'`, `!params.skip_qc`,
   `params.depth > 10 && params.trim`). **Add else if** adds an arm; the bin removes one. For
   a switch, choose the parameter and give each case its value.
3. Draw a line from an arm's exit to a step: the step goes into that arm. The panel lists each
   arm's steps; the × takes one out.
4. Connect the steps as usual. The step after the branch takes a connection from each arm.

The workflow check says when an arm has no condition, a switch has no parameter or an empty
case, a branch has no steps, or a step reads a step of another arm of the same branch (only one
of them runs).

**In the code**

```nextflow
ch_bam = channel.empty()
if (params.aligner == 'star') {
    STAR(ch_reads)
    ch_bam = STAR.out.bam
} else if (params.aligner == 'hisat2') {
    HISAT2(ch_reads)
    ch_bam = HISAT2.out.bam
} else {
    BOWTIE2(ch_reads)
    ch_bam = BOWTIE2.out.bam
}
REPORT(ch_bam)
```

Each channel the arms set starts empty before the branch and is set in the arm that runs. A
switch is written this way too: Nextflow's strict syntax has no `switch`.

**Importing** (see [Importing Workflows](https://github.com/HCIstudio/N-WAVE/wiki/Importing-Workflows#branches-and-loops)):
`if` / `else if` / `else`, nested `if`s, `switch` (read as if / else if), arms with channel code
(`ch_versions = ch_versions.mix(FASTQC.out.versions)`), and arms that pass on a channel from
before become branches. A step called in two arms is two nodes (the second named `…_2`).
Blocks that can't be shown this way stay code: an `if` that calls no step, a loop.

**Limits:** steps in a branch can't be grouped, and a group can't be put in an arm. A
connection that holds in one arm only comes from an import; on the canvas, put the step that
passes the channel on in the arm instead.

## Output

### Display Output

Shows what reaches it. After a run, **Results of the last run** shows the real files; choose
one under **View File** or all of them, and download it as text, CSV or JSON.

## Note

Text on the canvas that explains the workflow. Notes have no ports and add no code.
