A workflow is a set of **nodes** on a canvas, connected from outputs to inputs. N-WAVE
writes the Nextflow script from it. What each node does is in the
[Node reference](https://github.com/HCIstudio/N-WAVE/wiki/Nodes).

## Starting a workflow

On the home page:

- **New Workflow** offers an **Empty workflow**, the **QC of FASTQ files** template (FastQC on
  two test samples and a MultiQC report), or an editable copy of a built-in demo.
- **Import Workflow** reads a Nextflow script (`.nf`), pasted or from a file, and draws its
  processes as nodes. Files it lists have to be uploaded again; warnings show above the canvas.
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

**Download Workflow** saves the script, **Export Project** a runnable project. See
[Exporting projects](https://github.com/HCIstudio/N-WAVE/wiki/Exporting-Projects).

## See also

- [Running workflows](https://github.com/HCIstudio/N-WAVE/wiki/Running-Workflows)
- [Custom nodes](https://github.com/HCIstudio/N-WAVE/wiki/Custom-Nodes), for steps of your own
- The **Help** page in N-WAVE (its glossary), for terms such as *channel*, *tuple* or *meta*
