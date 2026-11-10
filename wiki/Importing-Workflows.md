N-WAVE can open Nextflow code as a workflow on the canvas: scripts N-WAVE exported, and
scripts written by hand. **Import Workflow** on the home page takes:

| What | How |
| --- | --- |
| A script (`.nf`) | **Choose File**, or paste it into **Nextflow Source** |
| A project zip | **Choose File** with the zip, for example one from **Export Project** |
| A project folder | **Choose Folder** |

For a project, N-WAVE reads `main.nf` (or, without one, the top-most script with a
`workflow { … }` block), the scripts its includes point to, `nextflow.config` and the files in
`inputs/`.

## What becomes what

| In the code | On the canvas |
| --- | --- |
| A process or named workflow the script defines or includes from the project | A step that keeps its code: open it to read or edit it, its inputs and outputs are ports |
| An nf-core module or subworkflow (`modules/nf-core/…`) | The nf-core node, with its settings from `nextflow.config` (`ext.args`, …) |
| A step from your node library, unchanged | That custom node |
| `STEP(ch_reads)`, `STEP.out.reads` | Connections between steps |
| Other channel code (`channel.fromPath(…)`, `.map { … }`, `.branch { … }`, `.view()`) | Channel operator nodes, one per block of code, with the script's variable names |
| `params.x = 5`, `'text'`, `true` | A Parameters node |
| File Input, Samplesheet, Filter, Map, Merge and Display Output code N-WAVE wrote | Those nodes again, with their settings and, from a project, their files |
| Comments above a step, `/* Note: … */` | Kept with the step; notes |
| Everything else: functions, plugin includes, params set from code, a `params { }` block, the `output { }` block, `publish:`, `onComplete:` and `onError:` | **Code nodes** that keep the code as written and say where in the script it goes |

Nothing is dropped: when N-WAVE has no node for something, it keeps the code. A call to a
process N-WAVE can't read (its file wasn't part of the import) stays as channel code, and the
banner above the canvas says which.

## Positions

Scripts N-WAVE wrote end with one comment line, `// N-WAVE layout: …`, with each step's place
and label. Import puts the steps back there. Without that line, steps are laid out left to
right in the order they run.

## Import, export, import

Export and import give each other's results back: importing what N-WAVE exported gives the
same canvas, and exporting it again gives the same code. This holds for the single script
(**Download Workflow**) and for the project (**Export Project**), where processes and named
workflows live in `modules/local/` and `subworkflows/local/`. Groups of steps come back as
groups: the layout line marks their steps (`FASTQC 380,80 "FastQC" @READ_QC`), and their
steps import as nodes of their own.

For scripts written by hand, the first export writes them in N-WAVE's layout (steps called by
name, outputs read as `STEP.out.x`, code N-WAVE has no node for in its place); from then on
the code stays the same. A project made of several files can be exported as one script; its
helper functions then move to the top of that script.

## See also

- [DAW model](https://github.com/HCIstudio/N-WAVE/wiki/DAW-Model): importing a workflow that
  isn't Nextflow code, or was only sketched
- [Exporting projects](https://github.com/HCIstudio/N-WAVE/wiki/Exporting-Projects): what
  the exported code and project look like
- [Building workflows](https://github.com/HCIstudio/N-WAVE/wiki/Building-Workflows)
- [Workflow analysis](https://github.com/HCIstudio/N-WAVE/wiki/Workflow-Analysis): what
  BioFlow-Insight finds in a workflow's code
