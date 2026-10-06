Node packs share custom nodes between N-WAVE installs, and with the browser demo, as files.
A pack holds one or more custom nodes. Importing it adds those nodes to the node menu; no
change to N-WAVE itself is needed.

### Sharing your nodes
1. Make the nodes: **Add node → Custom process**, or **Convert to custom node** on any
   node's Code tab.
2. Open **Add node → Node packs → Export**.
3. Tick the nodes, give the pack a name and a version (and optionally a description and an
   author), and click **Download pack**. You get `<pack-id>-<version>.nwave-pack.json`.

N-WAVE checks the pack the way an import would before it downloads it.

### Installing a pack
Open **Add node → Node packs → Import**, then do one of these:
- choose a pack file;
- paste the URL of a pack file and click **Load**;
- open **Community packs** and click **Load** next to a pack from the community index.

The preview lists every node with its checks:
- **Errors** (red): the node can't be imported; it's skipped. Typical causes are a source
  that doesn't declare the process or workflow the node names, or a port that isn't in the
  source.
- **Warnings** (yellow): the node imports, but check it. For example, an input the source
  parser couldn't infer.
- **Already installed**: the node's id is in use. Choose:
  - **Replace it**: the default when the installed node came from the same pack, as when
    updating the pack.
  - **Keep both (rename)**: the default otherwise.
  - **Skip this node**.

Click **Import**. nf-core modules and subworkflows that the nodes include are installed
first, then the nodes are saved:
- In the Docker install, they go to the backend (`NWAVE_CUSTOM_NODE_DIR`), so every user of
  the install sees them.
- In the demo, they go to this browser.

They appear in the node menu under **Pack: &lt;pack name&gt;**. They generate the same
Nextflow code as in the install they came from.

**Installed** lists the packs with their nodes. **Remove pack** deletes the pack's nodes,
and saved workflows lose those nodes. You can still edit a pack node like any custom node;
it stays listed under its pack.

### Pack format (version 1)
```json
{
  "format": "n-wave-node-pack",
  "formatVersion": 1,
  "id": "bam-tools",
  "name": "BAM tools",
  "version": "1.0.0",
  "description": "Sorting and statistics for BAM files",
  "author": "Jane Doe",
  "homepage": "https://example.org/bam-tools",
  "createdWith": "N-WAVE 1.2.10",
  "nodes": [
    {
      "id": "custom_head_lines_1791311681007",
      "label": "Head lines",
      "description": "The first lines of a file",
      "icon": "Code",
      "processName": "HEAD_LINES",
      "source": "process HEAD_LINES {\n  input:\n  path input_file\n  val max_lines\n ... }",
      "inputs": [
        { "name": "input_file", "kind": "path", "label": "Input file" },
        { "name": "max_lines", "kind": "val", "label": "Max lines", "settingType": "integer", "defaultValue": "20" }
      ],
      "outputs": [{ "name": "result", "emit": "result", "label": "Result" }],
      "arguments": [],
      "config": ["ext.args = '--quality 30'"],
      "nfcore": { "modules": [], "subworkflows": [] }
    }
  ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `format`, `formatVersion` | yes | Always `"n-wave-node-pack"`, and `1` for this version. Newer versions are refused by older N-WAVE releases with a message to update. |
| `id` | no | Lowercase letters, digits, `-`, `_`, `.`. Made from the name if missing. Installed nodes remember it, so a later version of the pack replaces them. |
| `name`, `version` | yes | Shown in the node menu ("Pack: name") and the library. |
| `description`, `author`, `homepage`, `createdWith` | no | Shown in the import preview. |
| `nodes` | yes | 1 to 200 nodes. |

Each node:

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Letters, digits, `_`, `-`, `.` (up to 120). Unique in the pack. It identifies the node in workflows, so keep it when you release a new version of the pack. |
| `label`, `description`, `icon` | label yes | How the node appears. `icon` is a [lucide](https://lucide.dev/icons) name. |
| `kind` | no | `"workflow"` for a named Nextflow workflow (such as a converted nf-core subworkflow), otherwise a process. |
| `processName`, `source` | yes | The process or workflow name and its Nextflow source. The source must declare that name. |
| `inputs` | no | Input ports (`kind: "path"`) and settings (`kind: "val"`, with `settingType` `text`, `integer`, `float`, `boolean`, `select` (with `options`) or `expression`, and `defaultValue`). Every input must be declared in the source. |
| `outputs` | no | Output ports. `emit` names the source's `emit:` (empty for the first unnamed output). |
| `arguments` | no | How inputs are passed to the process. Derived from the source when missing. |
| `config` | no | Process configuration lines, such as `ext.args`. |
| `nfcore` | no | nf-core `modules` (such as `samtools/sort`) and `subworkflows` the source includes. They're installed with the pack. Includes missing from the list are added, with a warning. |

### Community index
The node library lists the packs in a community index. Its URL is
`https://raw.githubusercontent.com/HCIstudio/N-WAVE-node-packs/main/index.json` unless the
frontend is built with `VITE_NODE_PACK_INDEX_URL`. The index lives in its own data
repository, so sharing a node with everyone is a pull request there, not to N-WAVE:

```json
{
  "format": "n-wave-node-pack-index",
  "formatVersion": 1,
  "packs": [
    {
      "id": "bam-tools",
      "name": "BAM tools",
      "version": "1.0.0",
      "description": "Sorting and statistics for BAM files",
      "author": "Jane Doe",
      "url": "packs/bam-tools-1.0.0.nwave-pack.json"
    }
  ]
}
```

`url` can be absolute or relative to the index. To contribute:
1. Export your pack.
2. Add the file under `packs/`.
3. Add an entry to `index.json`.
4. Open a pull request.
