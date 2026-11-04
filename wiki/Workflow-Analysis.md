N-WAVE can analyse a workflow's Nextflow code with
[BioFlow-Insight](https://gitlab.liris.cnrs.fr/sharefair/bioflow-insight), a tool that reads
Nextflow code without running it (Marchment, Brancotte, Schmit, Lemoine, Cohen-Boulakia:
*BioFlow-Insight: facilitating reuse of Nextflow workflows with structure reconstruction and
visualization*, NAR Genomics and Bioinformatics 6(3), lqae092, 2024,
[doi:10.1093/nargab/lqae092](https://doi.org/10.1093/nargab/lqae092)).

The analysis runs in the backend. What it finds will show on the canvas: errors in the code
and the workflow's structure ([#218](https://github.com/HCIstudio/N-WAVE/issues/218)), when
each step runs ([#220](https://github.com/HCIstudio/N-WAVE/issues/220)) and steps that belong
together ([#221](https://github.com/HCIstudio/N-WAVE/issues/221)).

## What is analysed

The workflow's script as N-WAVE writes it, the nf-core modules and subworkflows it includes,
and the other files of an imported project. BioFlow-Insight finds:

| What | For example |
| --- | --- |
| The steps, as the script calls them, and the subworkflows they are in | `GENOME.INDEX`: INDEX, called in the subworkflow GENOME |
| Which step's outputs reach which step | INDEX → ALIGN |
| The conditions a step runs under | TRIM runs when `params.trim` |
| Groups of steps that belong together | by condition, by the step they all depend on, by parallel branches |
| An error in the code | a call of a process the script doesn't have |

Nextflow's own parser (the language server, part of BioFlow-Insight) reads the code first.
When it finds an error, the analysis says so, and BioFlow-Insight's own parser reads the
structure as far as it can. Code that includes Nextflow plugins can't be checked this way
(the analysis has no network to look the plugins up); the analysis says that instead.

## Nothing leaves your installation

- The analysis runs on your machine, in its own container (`hcistudio/nwave-bioflow`),
  started by N-WAVE's backend for each analysis.
- The container has **no network**, a read-only file system and no access to N-WAVE's files:
  the backend hands it the workflow's code and gets the result back.
- It has a time limit (120 seconds) and at most 2 GB of memory and 2 CPUs.
- N-WAVE does not use BioFlow-Insight's web service; nothing is sent to it or anywhere else.

The first analysis downloads the image (a few hundred MB), as the first run downloads Nextflow's.

## Settings

Set these on the backend (see `latest.yml` or `docker-compose.yml`):

| Variable | What it does |
| --- | --- |
| `NWAVE_BIOFLOW=off` | No analysis; N-WAVE says it isn't available |
| `NWAVE_BIOFLOW_IMAGE` | Another image, e.g. one built from `backend/bioflow` (`nwave-bioflow:dev`) |
| `NWAVE_BIOFLOW_TIMEOUT` | The time limit in seconds (default 120) |

Without Docker, or without the image, N-WAVE works as before.

## How N-WAVE keeps it trustworthy

- BioFlow-Insight is used as published, at one pinned version, with all its dependencies
  pinned and checked by hash.
- Tests compare the analysis of fixed projects with recorded results, and compare the
  connections it finds with those of N-WAVE's own importer for every example; differences
  are listed and reported to the tool they concern.
- New versions are checked by hand before N-WAVE takes them
  ([UPDATING.md](https://github.com/HCIstudio/N-WAVE/blob/main/backend/bioflow/UPDATING.md)).

Details for developers: [backend/bioflow](https://github.com/HCIstudio/N-WAVE/tree/main/backend/bioflow).

## See also

- [Importing workflows](https://github.com/HCIstudio/N-WAVE/wiki/Importing-Workflows)
- [How N-WAVE explains things](https://github.com/HCIstudio/N-WAVE/wiki/How-N-WAVE-Explains-Things)
