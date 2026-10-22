# Node panels

The panel that opens when a node is double-clicked. `base/PropertiesPanel.tsx` is the frame
for every node except Display Output: the **Settings**, **Code** and **Results** tabs, the
label field, delete, and dragging and resizing. Each node type adds its settings below the
label. Which panel a node gets is decided in `src/pages/workflow/NodePanels.tsx`.

| Folder | Panels |
| --- | --- |
| `base/` | `PropertiesPanel`, `NodeCodeView` (Code tab), `NodeRunResults` (Results tab), `FloatingPanel` |
| `input/` | File Input, Samplesheet, Parameters, Note |
| `operator/` | Filter, Map, Merge, Channel Operator (with `BaseOperatorPanel` / `OperatorNodePanel`) |
| `process/` | nf-core module and subworkflow (with `NfCoreModuleDocs`, `NfCoreValueInputs`, `SaveOutputsToggle`), nf-core Pipeline (`PipelinePanel`, `PipelineResults`), custom and generic processes |
| `output/` | Display Output |

To add a panel for a new node type, put it in the matching folder, export it from the
folder's `index.ts`, and set it as `panel` in the node's definition. A panel receives the
`node` and `onSave(nodeId, data)`, and changes node data only through `onSave`, so undo, the
run lock and the read-only demos keep working.
User-facing behaviour is described in the wiki's
[Node reference](https://github.com/HCIstudio/N-WAVE/wiki/Nodes); keep it up to date.
