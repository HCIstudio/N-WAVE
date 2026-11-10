A workflow is a set of **nodes** on a canvas, connected from outputs to inputs. N-WAVE
writes the Nextflow script from it. What each node does is in the
[Node reference](https://github.com/HCIstudio/N-WAVE/wiki/Nodes).

## Starting a workflow

On the home page:

- **New Workflow** offers an **Empty workflow**, the **QC of FASTQ files** template (FastQC on
  two test samples and a MultiQC report), or an editable copy of a built-in demo.
- **Import Workflow** reads a Nextflow script (`.nf`, pasted or from a file), a project zip or
  a project folder and draws it on the canvas; warnings show above the canvas
  ([Importing workflows](https://github.com/HCIstudio/N-WAVE/wiki/Importing-Workflows)).
- On a workflow card: **Edit** (name and description), **Duplicate** and **Delete**.

The three **built-in demos** are read-only. The first change you make asks whether to
**Make a copy**: the copy opens with your change, and the demo stays as it is. **Just look**
keeps it unchanged.

Workflows save automatically a couple of seconds after each change (**Save Workflow** in the
bottom bar saves at once).

## Adding and editing nodes

- **+** (*Add node*, top right) lists the nodes by kind, with a search. From there you also
  open the **nf-core Library**, the **Custom process** editor and **Node packs**.
- **Double-click** a node to open its panel. Its tabs: **Settings**, **Code** (the Nextflow it
  adds) and **Results** (what it produced in the last run).
- **Delete** a node with its panel's delete button, the **Delete** key, or by dragging it onto
  the bin in the bottom-right corner. Hover a connection and click **×** to remove it.

Node colors show their kind: **inputs** light blue, **nf-core steps** green, **other steps**
grey (the legend is on the home page and on the Help page, which the canvas's **?** button
opens).

## Finding your way on a large canvas

- **Fit view** (the first button at the bottom left) zooms to fit the whole workflow; the
  buttons next to it zoom in and out.
- **Minimap**: a small map of the whole canvas sits at the bottom left, above the zoom
  buttons, colored like the legend (inputs, nf-core steps, other steps). During and after a run
  it colors the steps by what they did: running, done, failed, reused from the cache, or not run
  yet. Drag the map or click it to move the canvas. It can be switched off for everyone in
  [Global Settings → Features](https://github.com/HCIstudio/N-WAVE/wiki/Settings#features).
- **Steps inside**: an nf-core subworkflow node and a Pipeline node hold several steps, so they
  are drawn as a stack of cards with a **Step in** bar at the bottom. Like stepping into a
  function in a debugger, it opens the steps inside as a read-only graph, read from the
  workflow's `main.nf` (in nf-core/modules for a subworkflow, in the pipeline's repository at its
  version for a pipeline). Stacked steps in there have steps of their own and open in turn; the
  breadcrumb at the top leads back out, **Escape** closes it. During and after a run, each step
  shows what it did and how many of its tasks are done. Connections follow the channels the
  workflow passes from one step to the next; ones N-WAVE can't follow (built in a function, for
  example) are left out.
- **Copy into new workflow** (in the steps inside of an nf-core subworkflow, and in its
  node's panel) makes a new, editable workflow from the subworkflow's steps, to swap a tool, add
  a step or leave one out. The original node stays as it is
  ([Copying a subworkflow](https://github.com/HCIstudio/N-WAVE/wiki/nf-core-Library#copying-a-subworkflow)).
- **Zoom to the failing step** appears next to them after a run failed and goes to the step
  that failed.

## Views: the editor, the process graph, or groups

The switch in the bottom bar (**Editor** | **Process graph** | **Groups**) chooses what the
canvas shows:

- **Editor**: every node, editable.
- **Process graph**: the processes and how data flows between them. Channel code (channel
  operator nodes, and code kept from an import) is hidden, and each step connects straight
  to the steps its data reaches through it (dotted lines). Large imported workflows read as
  their steps this way.
- **Groups** (when the workflow has [groups](#groups-of-steps)): each group is one box with
  its steps listed, connected to the rest. **Open** (or a double-click) goes back to the
  editor, zoomed to the group's steps.

The process graph and groups are read-only, and drawn as a blueprint (blue paper, a title
block naming the view) so they can't be mistaken for the editor. Editing a node's settings,
or any other change, goes back to the editor.

**Connected in code** (orange dashed lines): code in a node can call a step or read another
node's output that the canvas doesn't connect to it, for example an imported
`if (params.trim) { TRIM(ch_reads) }`. N-WAVE finds these in the code it writes for the
canvas, draws them dashed, and says so in the workflow check (a warning on the node whose code
makes them). They work without a server, in the browser demo too, and follow the
**Connection hints** switch (Global Settings → Features).

## Groups of steps

Steps that belong together (a quality check and its report, an alignment with its sorting and
statistics) can be grouped into a **subworkflow**. Each step keeps its node and its settings;
the group changes how the code is written and adds a way to see the workflow:

1. Select the steps (click one, then Ctrl+click, or ⌘+click on a Mac, the others) and click
   **Group into subworkflow…** above the canvas. Or take a suggestion of the
   [analysis](https://github.com/HCIstudio/N-WAVE/wiki/Workflow-Analysis#steps-that-belong-together).
2. Name it. The name is the subworkflow's in the code (`Read QC` → `READ_QC`); it can't be a
   step's name or another group's.
3. On the canvas, a frame shows the group's steps, with **Rename** and **Ungroup** (the steps
   on their own again). **Groups** in the bottom bar shows each group as one box.

In the code, the group is a named workflow the workflow calls: what its steps read from the
other steps becomes its inputs (`take:`), what the other steps read from it its outputs
(`emit:`). It runs as before; Nextflow names its tasks `READ_QC:FASTQC`, and N-WAVE shows them
on their steps as usual.

```groovy
workflow READ_QC {
    take:
    ch_samplesheet

    main:
    FASTQC_RAW_READS(ch_samplesheet)
    TRIM_GALORE(ch_samplesheet)

    emit:
    reads = TRIM_GALORE.out.reads
    zip = FASTQC_RAW_READS.out.zip
}

workflow {
    …
    READ_QC(ch_samplesheet)
    STAR_ALIGN(READ_QC.out.reads, …)
}
```

- Only steps can be grouped: inputs, outputs, Parameters and notes stay outside.
- Data can't leave a group and come back into it through a step outside: add that step to
  the group, or leave out the steps after it. The workflow check says when that's the case.
- Channel code inside a group that names a channel outside it by name (not through a
  connection) can't see that channel in the subworkflow; connect it instead.
- [Importing](https://github.com/HCIstudio/N-WAVE/wiki/Importing-Workflows) a script or project
  N-WAVE wrote gives the groups back. A subworkflow written by hand imports as one step that
  keeps its code.

## Connecting

Drag from an output (the dots on a node's right) to an input (on the left).

- **Hover a node** to see what each port carries (for example `*.{bam}`) and whether it takes
  one connection or many.
- **While you drag**, inputs that fit are ringed green and inputs that don't are amber.
- **A connection that doesn't fit** is still made, but drawn dashed amber with a warning mark.
  Click the mark to see what the input expects and how to fix it.
- **Most inputs take one connection.** To bring several together, connect them to a **Merge** node
  or a **Channel Operator** first. Inputs that gather files (a taller handle, such as Merge's
  input or MultiQC's) take any number.
- **Loops are refused**, as is connecting a node to itself.

## The workflow check

The button next to **Run** checks the workflow while you build it and shows how many
problems it found. Click it for the list; **Show** moves the canvas to the node, which also
carries a red (problem) or yellow (warning) mark.

- **Problems stop the run**, for example a required input that isn't connected, a File Input
  without a file, samplesheet errors, nf-core components that aren't installed, or a server
  without Docker.
- **Warnings don't**, for example unconnected nodes or a run that asks for more than the
  server allows.

**Check again** asks the server again, for example after starting Docker.

## Undo, copy and paste, shortcuts

The undo and redo buttons are next to the zoom controls. Press **?** for all shortcuts:

| Keys (⌘ on macOS) | Action |
| --- | --- |
| Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y | Undo / redo |
| Ctrl+C, Ctrl+X, Ctrl+V | Copy, cut, paste the selected nodes (also into another workflow) |
| Ctrl+D | Duplicate the selected nodes |
| Delete or Backspace | Delete the selection |
| Ctrl+A, Shift+click | Select all, select several |
| F | Fit the workflow into view |
| Ctrl+S, Ctrl+Enter | Save, run |

Shortcuts don't fire while you type in a field. While a run goes, the workflow is locked
(an amber frame says so) until the run ends.

## Saving, and the same workflow in two tabs

The workflow saves itself two seconds after a change (or press the save button). A save never
overwrites a newer version saved in another tab: if the workflow was changed elsewhere since
you opened it, N-WAVE asks what to keep. You can load the saved version, keep yours as a copy,
or replace the saved version with yours. Changing or deleting a custom node also updates the
saved workflows that use it; a tab open on one of them shows that version when you come back
to it, or asks the same question if it has unsaved changes.

## Getting the Nextflow out

**Export** in the bottom bar saves the script, a runnable project or a DAW model. See
[Exporting projects](https://github.com/HCIstudio/N-WAVE/wiki/Exporting-Projects).

## See also

- [Running workflows](https://github.com/HCIstudio/N-WAVE/wiki/Running-Workflows)
- [Custom nodes](https://github.com/HCIstudio/N-WAVE/wiki/Custom-Nodes), for steps of your own
- The **Help** page in N-WAVE (its glossary), for terms such as *channel*, *tuple* or *meta*
