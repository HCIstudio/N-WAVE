N-WAVE can analyse a workflow's Nextflow code with
[BioFlow-Insight](https://gitlab.liris.cnrs.fr/sharefair/bioflow-insight), a tool that reads
Nextflow code without running it (Marchment, Brancotte, Schmit, Lemoine, Cohen-Boulakia:
*BioFlow-Insight: facilitating reuse of Nextflow workflows with structure reconstruction and
visualization*, NAR Genomics and Bioinformatics 6(3), lqae092, 2024,
[doi:10.1093/nargab/lqae092](https://doi.org/10.1093/nargab/lqae092)).

**Analyse** in the bottom bar checks the workflow's code, and the
[graph views](#graph-views) show its structure. Two tools look at the code N-WAVE writes for
the canvas, on your own machine:

- **nextflow lint**, Nextflow's own checker: errors and warnings, each with its line;
- **BioFlow-Insight**: the workflow's structure, the conditions steps run under, and errors it
  finds.

## Using it

1. Open a workflow and click **Analyse** (the magnifier in the bottom bar). The first analysis
   downloads the tools; later ones take a few seconds.
2. **Code check**: what the tools found. Each problem says which tool found it and where
   (the line of the script, or the nf-core module's file), and **Show** goes to the node whose
   code it is in. The problems are in the workflow check next to **Run** too, and are marked on
   their nodes. They don't keep the workflow from running: lint is stricter than the Nextflow
   that runs it.
3. **Its structure**: **Specification graph** and **Process dependency graph** open the
   [graph views](#graph-views).

When you change the workflow, its problems leave the check until you analyse it again (moving
nodes doesn't count). Most useful after editing code: custom processes, channel operator code,
and code kept from an import. Code N-WAVE writes from its own nodes passes the check.

In the [browser demo](https://hcistudio.github.io/N-WAVE/) there is no server to analyse on:
the built-in examples show the analysis they got when the demo was built, other workflows say
that analysing needs an installation. The graph views are greyed out there.

## Graph views

Two read-only views of the workflow's code, in place of the editor (the switch in the bottom
bar, or the buttons in the analysis). They are BioFlow-Insight's two graphs of the code, the
same that its paper describes, and they show what the editor doesn't: the editor is the
workflow as you build it, these are the workflow as Nextflow will run it.

- **Specification graph**: every process (a box) and every channel operation (a pill), with
  the channels between them. Subworkflows (nf-core subworkflows, your
  [groups](https://github.com/HCIstudio/N-WAVE/wiki/Building-Workflows#groups-of-steps)) are
  frames. Use it to check that the code does what the canvas shows, and to find logic that
  only the code has: code kept from an import, a custom process's channels, the operations
  inside an nf-core subworkflow.
- **Process dependency graph**: only the processes, with an arrow where one's output reaches
  another, through any channel operations. Use it to see what depends on what.

Both read left to right, in the order data flows. In both:

- **Select a process**: what it depends on (blue) and what a change to it affects (amber),
  with the counts and lists in the side panel. **Show in the editor** goes to its node.
- **Collapse** a subworkflow (its frame's arrow, or **Collapse subworkflows**): it becomes one
  box, connected to the rest. The workflow as its parts; **Expand all** opens them again.
- **Insights** (the side panel): how many processes, operations, dependencies and
  subworkflows; the **longest chain**, the processes a run waits for one after the other (the
  ones to make faster); how many processes can run **side by side**; where the workflow
  **starts** and **ends**; the processes **most depended on** (a change to them affects the
  most); the processes that run under a condition. **Highlight it** shows the longest chain.

Opening a view analyses the workflow if it hasn't been analysed as it is. **Export** →
**Diagram** draws either graph as SVG, PNG, Mermaid or Dot, laid out as in the view. In the
browser demo, the graph views are greyed out: they need an installation.

## Steps that belong together

BioFlow-Insight finds steps that belong together: those that run under the same condition, a
step and the steps only it leads to, parallel branches. The panel lists them (two steps or
more, not already a group) under **Steps that belong together**; **Group into subworkflow…**
groups one ([Groups of steps](https://github.com/HCIstudio/N-WAVE/wiki/Building-Workflows#groups-of-steps)).
Grouping by hand doesn't need the analysis.

## When a step runs

After an analysis, a step that runs only under a condition (inside an `if`, or its `else`)
has an **if** badge on its node; hover it to read the condition. Its panel shows **When it
runs**: each condition, and whether it holds.

N-WAVE checks the conditions against the **Parameters** node's values, and a step that won't
run with them is greyed out. Change a value (say `aligner` from `star` to `hisat2`) and the
canvas follows straight away, without analysing again: the other aligner greys out.

- A subworkflow node shows the conditions all of its steps share.
- N-WAVE evaluates `params.…`, strings, numbers, `true`, `false`, `null`, `!`, `&&`, `||`,
  comparisons and parentheses. A condition with anything else (a function, a value computed
  during the run), or with a parameter the Parameters node doesn't set, shows `?` and greys
  nothing out.
- It is a preview: Nextflow decides when it runs, with the values it is given then.
- The badges stay as long as the workflow's steps and code are as analysed. Changing a
  parameter's value keeps them; any other change of the code removes them until the next
  analysis.

Switch it off in Global Settings → Features → When steps run (`conditions`).

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

- The analysis runs on your machine, in containers N-WAVE's backend starts for each analysis:
  `hcistudio/nwave-bioflow` for BioFlow-Insight and `nextflow/nextflow:25.10.4` for lint.
- The container has **no network**, a read-only file system and no access to N-WAVE's files:
  the backend hands it the workflow's code and gets the result back.
- It has a time limit (120 seconds) and at most 2 GB of memory and 2 CPUs.
- N-WAVE does not use BioFlow-Insight's web service; nothing is sent to it or anywhere else.

The first analysis downloads the images (a few hundred MB each), as the first run downloads
Nextflow's.

## Settings

Set these on the backend (see `latest.yml` or `docker-compose.yml`):

| Variable | What it does |
| --- | --- |
| `NWAVE_BIOFLOW=off` | No BioFlow-Insight; the analysis says it isn't available |
| `NWAVE_BIOFLOW_IMAGE` | Another image, e.g. one built from `backend/bioflow` (`nwave-bioflow:dev`) |
| `NWAVE_BIOFLOW_TIMEOUT` | Its time limit in seconds (default 120) |
| `NWAVE_LINT=off` | No nextflow lint |
| `NWAVE_LINT_IMAGE` | The Nextflow image lint runs in (default `nextflow/nextflow:25.10.4`) |
| `NWAVE_LINT_TIMEOUT` | Its time limit in seconds (default 120) |

**Analyse** itself is a feature switch (Global Settings → Features → Workflow analysis).
Without Docker, or with a tool switched off, the analysis says what isn't available and
N-WAVE works as before.

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
