A custom node is a step you write yourself: a Nextflow process (or a named workflow) that
becomes a reusable node in the menu. Use one for a tool nf-core doesn't have, a script of your
own, or a changed version of an existing node.

## Making one

- **From scratch:** **+** (*Add node*) → **Custom process**.
- **From any node:** open its **Code** tab and click **Convert to custom node**. The node is
  replaced in place by a custom node with a copy of its code, settings such as `ext.args`
  included; connections to ports that still exist are kept.

In the editor, give the node a **Name**, an **Icon** and a **Description**, and write or paste
the **Nextflow process code**. N-WAVE reads the process and fills in:

| Section | What it is |
| --- | --- |
| **File Inputs** | The process's `path` inputs, which become input ports. At least one is needed. |
| **Settings** | Its `val` inputs, shown in the node's panel: Text, Integer, Float, Boolean, Selection (a comma-separated list) or Groovy expression, each with a default. |
| **Outputs** | Its outputs, which become output ports. At least one is needed. |

Check the labels and file patterns, then **Save Node**. The node appears in the menu under
**Custom**.

## Changing and removing

In the node menu, use the **Edit** or **Delete** button next to a custom node (or **Edit
custom node** on its Code tab). Changes apply to the copies already placed in workflows.
Deleting a custom node also removes it from every saved workflow.

## Where they are kept

On an installation, custom nodes are stored by the server (in `results/.nwave/custom-nodes`
with the Docker setup), so everyone using it sees them. In the
[browser demo](https://hcistudio.github.io/N-WAVE/), they are kept in this browser.

## Sharing

Put custom nodes into a **node pack** to share them as a file or through the community index:
[Node packs](https://github.com/HCIstudio/N-WAVE/wiki/Node-Packs).

## Tips

- Give the process a `container` with the tools it needs, so it runs the same everywhere.
- Write exactly the files the `output:` block names, or the run fails with
  [Missing output files](https://github.com/HCIstudio/N-WAVE/wiki/Troubleshooting#missing-output-files).
- For channel logic between nodes (join, mix, branch), use a **Channel Operator** instead
  ([Node reference](https://github.com/HCIstudio/N-WAVE/wiki/Nodes#channel-operator)).
- See also Nextflow's [process documentation](https://www.nextflow.io/docs/latest/process.html).
