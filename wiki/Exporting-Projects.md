N-WAVE can hand a workflow over as plain Nextflow, to run without N-WAVE: on a server, a
cluster or a colleague's computer. Both buttons are in the bottom bar and work in the
[browser demo](https://hcistudio.github.io/N-WAVE/) too.

| Button | You get |
| --- | --- |
| **Download Workflow** | The generated script (`<workflow>.nf`) on its own. |
| **Export Project** | A zip with everything the run needs. |

## The project

```
<workflow>/
├─ main.nf                # the workflow
├─ nextflow.config        # parameters, node settings, run profiles, and the execution report, timeline and trace
├─ modules/local/         # its own processes, one folder each
├─ subworkflows/local/    # its own named workflows, if any
├─ modules/nf-core/       # the nf-core modules it uses, at N-WAVE's pinned version
├─ subworkflows/nf-core/  # the nf-core subworkflows it uses, if any
├─ inputs/                # the uploaded files and samplesheets
└─ README.md              # how to run it, and which inputs it expects
```

With [Nextflow](https://www.nextflow.io/docs/latest/install.html) and Docker installed:

```bash
unzip <workflow>.zip && cd <workflow>
nextflow run main.nf -profile docker
```

- Results go to `results/`; add `--outdir <folder>` to change that, and `-resume` to continue
  a run.
- Input files N-WAVE couldn't include (too large to keep, or not uploaded) are listed in the
  README as **not included**: put them in `inputs/` before running.
- Parameters from a Parameters node can be changed on the command line, for example
  `--fasta genome.fa`.
- The workflow's [run profiles](https://github.com/HCIstudio/N-WAVE/wiki/Run-Profiles) can be
  used in place of `docker`, for example `-profile slurm`.

## The code

The script reads like Nextflow written by hand:

- Steps are named after their labels (`FASTQC_RAW_READS`) and called by name; outputs are
  read as `FASTQC_RAW_READS.out.zip`. Channels are named after their nodes (`ch_samplesheet`).
- Code that adapts one step's output to the next step's input is written only where the two
  differ.
- Notes become `/* Note: … */` comments, and the last line, `// N-WAVE layout: …`, keeps the
  canvas positions, so [importing](https://github.com/HCIstudio/N-WAVE/wiki/Importing-Workflows)
  the code gives the same canvas back.
- In a project, processes and named workflows are in `modules/local/` and
  `subworkflows/local/` and included from `main.nf`. Steps that use N-WAVE's helper functions
  (Filter, Map) stay in `main.nf`, where those functions are.

## A workflow with an nf-core Pipeline node

The project holds the launch instead of a script: `run.sh`, `params.json`, the inputs, a README
and, with run profiles, `profiles.config`. Nextflow downloads the pipeline on the first run:

```bash
bash run.sh
```

The script download is a single launch script that writes `params.json` and starts the
pipeline.

## See also

- [Importing workflows](https://github.com/HCIstudio/N-WAVE/wiki/Importing-Workflows): opening
  an exported project, or any Nextflow script, on the canvas
- [Running workflows](https://github.com/HCIstudio/N-WAVE/wiki/Running-Workflows) in N-WAVE
  itself
- [nf-core library](https://github.com/HCIstudio/N-WAVE/wiki/nf-core-Library): how modules
  become nodes
