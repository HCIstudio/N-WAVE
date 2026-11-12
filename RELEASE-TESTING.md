# Testing a release on a local machine

The automated tests (unit, end-to-end in the browser demo, Nextflow lint of the generated code)
run on every pull request. They don't cover the installed N-WAVE: Docker on your own machine,
real Nextflow runs, the analysis images, browser notifications, two tabs, a restart. Before a
minor or major release, go through this list on a real installation, then bump the version
(see [Releases](CONTRIBUTING.md#releases)).

Copy the list into the release's testing issue and tick what works. For anything that doesn't,
open an issue (or fix it) and link it next to the item. The release waits until each item works
or has an issue that is explicitly moved to a later release.

## Setup

- Test the **release candidate**: the images built from `main` before the bump. Pull them with
  `latest.yml` from `main` (or build them with `docker compose build`).
- At least one machine each: **Linux**, **macOS** (Apple silicon, the `linux/arm64` images) and
  **Windows** with Docker Desktop (WSL 2). On the others, a quick pass is enough: install, Demo 1
  run, an import, Analyse.
- Two browsers: Chrome or Edge, and Firefox or Safari.
- Keep a workflow file and an exported project from the **previous release** ready (for
  [Upgrading](#upgrading-from-the-previous-release)).
- Switch **verbose mode** on for the session (Global Settings → Verbose mode). Export the log
  at the end and attach it to the issue: it shows what happened when something went wrong.

## Install and start

- [ ] A fresh install as the [wiki](https://github.com/HCIstudio/N-WAVE/wiki/Installation) says
      (download `latest.yml`, `docker compose -f latest.yml up -d`) starts. N-WAVE opens on
      `http://localhost:5173`.
- [ ] The version on the home page and in Global Settings is the release candidate's.
- [ ] Stopping and starting again (`stop`, `up -d`) keeps workflows, installed nf-core
      components, custom nodes, settings and run history.
- [ ] `down` and `up -d` keep them too; `down -v` removes the saved workflows, as documented.
- [ ] With `NWAVE_BIND_ADDRESS=0.0.0.0`, N-WAVE is reachable from another machine; without it,
      only from this one.
- [ ] With Docker stopped, N-WAVE says that runs and the analysis need Docker, and the canvas
      still works.

## Upgrading from the previous release

- [ ] Upgrading an installation of the previous release (new `latest.yml`, `pull`, `up -d`)
      keeps its workflows, installed components, custom nodes, node packs, settings and runs.
- [ ] Workflows saved with the previous release open, look as before, and generate the same
      code (or cleaner code that runs the same).
- [ ] A workflow file exported from the previous release imports.
- [ ] Resuming a run started with the previous release works, or says why it can't.

## Home page, help and demo

- [ ] On the first visit, a box between the title and the demos offers the first course
      (**Start the first course**, **All courses**, **Not now**). It tours the home page and
      ends with the user's own **New Workflow** from Demo 1 (the dialog says so); that workflow
      opens with **The canvas** course, in a card on the canvas: each task (open Map, set it to
      lowercase, remove a Filter, add it from the + menu, connect it) goes on once done.
      **Courses** lists the basics and the advanced courses (greyed in the demo); the canvas
      course started there makes its own copy; **Next course** starts the nf-core course,
      which builds Samplesheet → FastQC → MultiQC. A finished course is marked done.
- [ ] Workflow cards show their buttons (rename, duplicate, delete) without hovering.
- [ ] A node added from the + menu is in view; while a connection is drawn, the other nodes'
      inputs show their names, and the ones that fit (MultiQC's files too) are green.
- [ ] Each built-in demo opens read-only; duplicating it gives an editable copy.
- [ ] Workflow cards show the last run and its result. Editing the name and description,
      duplicating and deleting work.
- [ ] The **Help**, **Glossary** and **Roadmap** pages open, and their links (wiki, issues)
      work. The roadmap shows the release under test.
- [ ] The **References** page opens from the home page's footer; its DOI, website and wiki
      links work.
- [ ] Term hover cards on the canvas and in panels show their explanation and docs link.
- [ ] The [browser demo](https://hcistudio.github.io/N-WAVE/) (after the release): demos open,
      the tutorial works, Analyse shows the recorded analysis. What needs a server (Run, Resume,
      the run cache, Runs) is shown greyed out and says it needs a full install.

## Building a workflow

- [ ] A new workflow from each template, and an empty one.
- [ ] Adding nodes from the library: search, categories and the legend. New nodes don't land on
      top of existing ones.
- [ ] Connecting: compatible inputs are marked while dragging; an incompatible connection warns.
      An input that takes one connection doesn't take a second; a "many" input does.
- [ ] Connection hints label the edges without overlapping (for example on Demo 3's STAR step).
- [ ] Undo and redo of adding, deleting, connecting, moving and typing a setting.
- [ ] Copy and paste nodes within a workflow and into another one. Keyboard shortcuts as listed
      in the shortcuts dialog.
- [ ] Minimap, zoom to fit, and a large workflow (Demo 3) stay smooth.
- [ ] The workflow check lists problems with **Show**, marks their nodes, and blocks **Run**
      with the reason (for example a File Input without a file).
- [ ] **Parameters** node: text, number, boolean and reference-file parameters; the reference
      connects to other nodes and ends up in the exported project.
- [ ] **File Input**: upload a text file and a binary `.fastq.gz`; connect it before uploading.
- [ ] **Samplesheet**: paired-end and single-end, edited in the panel and uploaded as CSV.
- [ ] **Channel operators**: each operator's settings, its code, and its templates (Branch,
      Group). The generated code matches what the panel says.
- [ ] Saving is automatic. The same workflow open in two tabs: editing in one tab shows the
      conflict dialog in the other, and each choice in it does what it says.

## nf-core and your own nodes

- [ ] The nf-core library lists modules and subworkflows. Install one, use it, uninstall it.
      A workflow that needs a missing component offers to install it.
- [ ] A module node's docs (inputs, outputs, links) and value settings.
- [ ] A **subworkflow** node: its nested view opens with a breadcrumb; **Copy into new workflow**
      gives an editable workflow with its takes as inputs and emits as outputs.
- [ ] A **Pipeline** node (nf-core/rnaseq with its `test` profile): the schema form, a run, and
      its results.
- [ ] **Custom nodes**: create one, edit its code in the Code tab, convert an nf-core node into a
      custom node, reload the page and find it again.
- [ ] **Node packs**: export your custom nodes as a pack, import it from a file and from a URL,
      and resolve a name conflict.

## Running

- [ ] Demo 1 runs; each node's status follows the run live, and its Results view shows its files.
- [ ] Demo 2 and Demo 3 run on their test data (the first run downloads the containers).
- [ ] The run panel: live log, copying the log, run history, reopening an earlier run.
- [ ] **Cancel** stops the run, and its containers are gone (`docker ps`).
- [ ] Run limits (CPUs, memory, time limit) from Global Settings apply; a run over the time
      limit stops and says so.
- [ ] A failing run (for example a custom process that exits with an error): the failure
      explanation next to the log, with its evidence lines (**Show in log**), how sure it is,
      the failing node marked, and the wiki link.
- [ ] **Error Handling Strategy** (Execution Settings → Advanced): with **Ignore**, a failing step
      doesn't stop the others. **Cleanup on Failure** deletes a failed run's work directory, and
      Resume then runs every step.
- [ ] **Resume** after fixing the failure: the finished steps are cached, only the rest runs.
      The run cache size in Global Settings, and clearing it.
- [ ] Closing the tab or going Home during a run warns. Reopening the workflow reattaches to the
      running run.
- [ ] Restarting the backend during a run (`docker compose restart backend`): N-WAVE waits for
      it and shows how the run ended.
- [ ] The runs overview on the home page, and **Stop all**.
- [ ] Performance tab, execution report and timeline after a run.
- [ ] Browser notifications at the end of a run, and when the backend is lost and back.
- [ ] A **run profile** (SLURM, if a cluster or a test setup is available): the profile's config,
      a run through it, and the profile in the exported project.

## Export and import

- [ ] **Export** in the bottom bar opens one dialog: **Download script**, **Copy script** (the
      script on the clipboard), **Download project** and **Download DAW model** each do what it says.
- [ ] **Diagram** in the Export dialog: SVG, PNG, Mermaid and Dot of the canvas open in a browser,
      an image viewer, mermaid.live and Graphviz; after **Analyse**, the same for the analysis's
      steps and channels.
- [ ] **Export** → **Download project**: the zip runs with plain Nextflow (`nextflow run main.nf -profile docker`)
      without N-WAVE, and gives the same results. Its README is right.
- [ ] Exporting the same workflow twice gives identical files.
- [ ] The exported `main.nf` reads like hand-written Nextflow: names from labels, `PROC.out`
      references, no leftover boilerplate.
- [ ] **Import**: a downloaded script imports back into the same graph (nodes, settings,
      connections, positions); exporting again gives the same script.
- [ ] Import of a project zip and of a folder (local modules included).
- [ ] Import of hand-written pipelines (a training example, an nf-core style pipeline with
      `if` blocks and subworkflows): a sensible canvas, kept code where N-WAVE has no node, and
      an export that passes `nextflow lint` and runs.
- [ ] Import warnings are shown on the canvas and make sense.

## Analysis (v1.6)

- [ ] **Analyse** on a built-in example: no problems, and its buttons open both graph views.
      **Export** → **Diagram** of either graph as Mermaid and Dot. The first analysis downloads
      the images.
- [ ] An error added to a custom process shows on its node, in the workflow check, with the
      tool and line. It doesn't block Run.
- [ ] Changing the code removes the analysis's problems; moving nodes doesn't.
- [ ] An imported nf-core style pipeline analyses, including its nf-core modules.
- [ ] With no network for the containers (unplug, or a firewall): the analysis still works.
- [ ] `NWAVE_BIOFLOW=off` and `NWAVE_LINT=off`: the panel says which tool isn't available.
- [ ] **Canvas views**: connections made in code show as dashed lines with a warning.
      **Specification** and **Dependencies** show BioFlow-Insight's graphs of the code, read-only
      on blueprint paper (analysing first if needed): selecting a process shows what it depends
      on and what a change affects, subworkflows collapse to one box, the side panel's numbers
      and longest chain make sense, **Show in the editor** and **Back to the editor** work. In
      the browser demo both are greyed out and say a full install is needed.
- [ ] **When a step runs**: in an imported script with `if (params.aligner == …)`, the steps
      have **if** badges. Changing the parameter's value greys out the other branch straight
      away, and the panel's **When it runs** says which condition holds.
- [ ] **Group steps into a subworkflow**: grouping a suggested group, and steps selected by
      hand. The grouped workflow runs as before, its export passes `nextflow lint`, and it
      imports back grouped. Clicking a group's name renames or ungroups it; in the graph views
      the group is a subworkflow that collapses to one box.
- [ ] **DAW model**: **Export** → **Download DAW model**, import the file, and get the same canvas (and the
      same file when exported again). A model written by hand with tasks that have no
      implementation opens as placeholders, and the workflow check lists them.

## Global Settings and studies

- [ ] Each **feature switch** in Global Settings → Features removes what it says, and brings it
      back. Switches fixed for the installation (`NWAVE_FEATURES`) can't be changed in the UI.
- [ ] **Verbose mode**: events are recorded for each area above, the recording indicator shows,
      a participant ID and marked tests are kept, the export ZIP has the session, and **Clear**
      empties the log. With verbose mode off, nothing is recorded.

## Accessibility and browsers

- [ ] The canvas, panels and dialogs work with the keyboard alone (Tab, Enter, Escape), and focus
      is visible.
- [ ] A screen reader (VoiceOver or NVDA) reads the bottom bar, the panels, the workflow check
      and the run panel sensibly.
- [ ] The second browser: a pass over building, running, import and Analyse.
- [ ] A small window (1280 × 720) and zoom at 200 %: nothing important is cut off.

## Release

- [ ] Every item above works, or has a linked issue moved to a later release.
- [ ] The wiki pages of the release's features match what N-WAVE does.
- [ ] The bump pull request: `"version"` in `frontend/package.json` and `backend/package.json`,
      the roadmap (release `released`, `ROADMAP_UPDATED_FOR`, the next release `in-progress`).
