[nf-core](https://nf-co.re/) maintains over 2,000 tested Nextflow modules for bioinformatics
tools (FastQC, Trim Galore, STAR, Salmon, SAMtools, MultiQC, …) and over 100 subworkflows that
combine them. N-WAVE turns each one into a node.

## Installing a module or subworkflow

1. Click **+** (*Add node*) → **nf-core Library**.
2. Choose the **Modules** or **Subworkflows** tab and search, for example `fastqc` or
   `star/align`.
3. Click **Install**. The node appears in the node menu under *Installed nf-core*.

Installing a subworkflow also installs the modules it includes. Installed components stay
installed; **Remove** takes one out again. In the
[browser demo](https://hcistudio.github.io/N-WAVE/) they install into this browser.

When a workflow uses components that aren't installed (a template, an example, a workflow from
another installation), a banner above the canvas lists them with **Install them**.

## What the labels mean

| Label | Meaning |
| --- | --- |
| **Generated** | N-WAVE understood every input and output: it installs and works like any node. |
| **Needs review** | Some input or output couldn't be mapped, so it can't be installed automatically. |
| **Can't be built** | The module lacks the metadata N-WAVE needs. |
| **Installed** | Already in the node menu. |

A module that doesn't install can still be used: install a similar one, or write it as a
[custom node](https://github.com/HCIstudio/N-WAVE/wiki/Custom-Nodes) (**Convert to custom node**
on any node's **Code** tab copies its code to start from).

## Using a module

nf-core modules take samples as `[ meta, files ]`: start from a **Samplesheet** node, or
connect files directly (N-WAVE makes a sample of each). References such as a genome or an
index come from a **Parameters** node. The **QC of FASTQ files** template (**New Workflow**)
and **Demo 3** show both. Settings are described in the
[Node reference](https://github.com/HCIstudio/N-WAVE/wiki/Nodes#nf-core-module).

Each module's outputs are copied to `results/<node name>/`, like nf-core pipelines lay out
their results.

## Whole pipelines

The **nf-core Pipeline** node runs a complete pipeline, such as nf-core/rnaseq, instead of
single modules. See
[Running the nf-core/rnaseq example](https://github.com/HCIstudio/N-WAVE/wiki/Running-the-nf-core-rnaseq-Example)
and, for the same analysis rebuilt from modules,
[RNA-seq with STAR and Salmon](https://github.com/HCIstudio/N-WAVE/wiki/RNA-seq-STAR-Salmon-Example).

## How it works

N-WAVE ships a catalog of nf-core/modules pinned to one version; installing downloads a
module's files at that version. How module inputs become ports and settings, and how to fix a
module the automatic mapping gets wrong, is in
[scripts/README.md](https://github.com/HCIstudio/N-WAVE/blob/main/scripts/README.md).
