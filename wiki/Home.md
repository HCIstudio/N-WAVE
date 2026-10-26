**N-WAVE** (Nextflow Workflow Authoring and Visualization Environment) is a visual editor for
[Nextflow](https://www.nextflow.io/) workflows. You connect nodes on a canvas (inputs,
[nf-core](https://nf-co.re/) tools, operators, outputs), and N-WAVE writes the Nextflow script,
runs it and shows the results.

![The N-WAVE canvas with Demo 1: a File Input feeding two Filters, a Map and a Merge into a Display Output](https://raw.githubusercontent.com/HCIstudio/N-WAVE/main/.github/assets/screenshot-canvas.png)

## Start here

1. **Try it** in the [browser demo](https://hcistudio.github.io/N-WAVE/), no installation
   needed (building and exporting only), or [install it](https://github.com/HCIstudio/N-WAVE/wiki/Installation)
   with Docker to run workflows.
2. **Build your first workflow** in 10 minutes:
   [First workflow](https://github.com/HCIstudio/N-WAVE/wiki/First-Workflow). Or open
   **Demo 1** on the home page and follow its tutorial.

## Guides

| Page | For |
| --- | --- |
| [Building workflows](https://github.com/HCIstudio/N-WAVE/wiki/Building-Workflows) | Adding and connecting nodes, the workflow check, templates, import, shortcuts |
| [Node reference](https://github.com/HCIstudio/N-WAVE/wiki/Nodes) | What every node does and its settings |
| [nf-core library](https://github.com/HCIstudio/N-WAVE/wiki/nf-core-Library) | Installing and using nf-core modules, subworkflows and pipelines |
| [Custom nodes](https://github.com/HCIstudio/N-WAVE/wiki/Custom-Nodes) and [Node packs](https://github.com/HCIstudio/N-WAVE/wiki/Node-Packs) | Steps of your own, and sharing them |
| [Running workflows](https://github.com/HCIstudio/N-WAVE/wiki/Running-Workflows) | The run panel, settings, resources, resuming, where results are |
| [Run profiles](https://github.com/HCIstudio/N-WAVE/wiki/Run-Profiles) | Running on a SLURM cluster or AWS Batch |
| [Exporting projects](https://github.com/HCIstudio/N-WAVE/wiki/Exporting-Projects) | Running a workflow without N-WAVE |
| [Troubleshooting](https://github.com/HCIstudio/N-WAVE/wiki/Troubleshooting) | Failed runs, Docker, paths, the first slow run |

**Examples:** [Running the nf-core/rnaseq pipeline](https://github.com/HCIstudio/N-WAVE/wiki/Running-the-nf-core-rnaseq-Example)
(Demo 2) · [RNA-seq rebuilt from nodes](https://github.com/HCIstudio/N-WAVE/wiki/RNA-seq-STAR-Salmon-Example)
(Demo 3)

## Elsewhere

- **Help** in N-WAVE: what N-WAVE does, the node colors, the canvas, and a glossary of every
  term (process, channel, tuple, `meta`, samplesheet, …) in a sentence or two. Open it from the
  home page, the canvas's **?** button, or the ⓘ buttons next to the terms.
  Online: [Help in the demo](https://hcistudio.github.io/N-WAVE/help).
- **[README](https://github.com/HCIstudio/N-WAVE#readme)**: overview, configuration, security
  and architecture.
- **[CONTRIBUTING.md](https://github.com/HCIstudio/N-WAVE/blob/main/CONTRIBUTING.md)**:
  developing N-WAVE, its checks and releases.
- **[Issues](https://github.com/HCIstudio/N-WAVE/issues)**: report a bug or ask for a feature.

These pages are edited in the repository's
[`wiki/` folder](https://github.com/HCIstudio/N-WAVE/tree/main/wiki), together with the code
they describe.
