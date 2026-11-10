N-WAVE can write a workflow as a **DAW model**: a description of it in terms that don't belong
to Nextflow or to N-WAVE, and read one back. It follows the consolidated metamodel of data
analysis workflow (DAW) languages by Hilbrich et al.
([2022](https://doi.org/10.1007/978-3-031-19756-7_12),
[metamodel and mappings](https://github.com/CRC-FONDA/T1-DAW-Metamodel)), which describes
workflows of Nextflow, Airflow, CWL, Argo and others with the same few concepts:

- a **DAW** solves a problem, and can be divided into sub-DAWs;
- a **Task** is a solution of a (sub-)problem;
- a **Storage** is where data comes from or goes to;
- an **Interconnection** passes data (or control) between them.

Use it to share a workflow with tools that aren't Nextflow, to compare workflows, or to start
from a workflow that was only sketched: its steps open as placeholders to fill in.

## Export and import

- **Export** in the bottom bar → **Download DAW model** downloads `<workflow>.daw.json`.
- **Import Workflow** on the home page takes a DAW model like a Nextflow script: choose the
  file, or paste it.

A model N-WAVE wrote gives the same canvas back (nodes, settings, connections, positions,
groups, notes), and exporting that gives the same file. It contains the files uploaded to File
Input nodes and the samplesheets. It leaves out run profiles, which name clusters and accounts.

## What becomes what

N-WAVE follows the metamodel's own mapping of Nextflow where it has one.

| On the canvas | In the model |
| --- | --- |
| The workflow | DAW |
| A [group of steps](https://github.com/HCIstudio/N-WAVE/wiki/Building-Workflows#groups-of-steps) | sub-DAW with its Tasks |
| An nf-core subworkflow, a pipeline, a custom workflow node | sub-DAW by `reference` (its parts aren't listed) |
| A process: nf-core module, custom node, Filter, Map, Merge | Task: `Executable`, with its code or the nf-core module it refers to |
| A step without an implementation yet | Task: `Task` (the solution idea only) |
| Channel code | Task: `InlineDescription` |
| Channel code that decides which steps get data (`if`, `branch`, `filter`) | Task: `SkipTask` |
| Code for when the run completes or fails | Task: `Monitor` |
| File Input, Samplesheet, Display Output | Storage: `FileStorage` |
| Parameters | Storage: `IntermediateStorage` (`FileStorage` when all are files) |
| A connection | `StreamingInterconnection` (a channel), or `SimpleSendDataInterconnection` from a single value |
| A step's container and process settings (`ext.args`, …) | `ExecutionContext` of its Task |

## A model from elsewhere

A model without N-WAVE's own data, written by another tool or by hand, opens as a skeleton:

| In the model | On the canvas |
| --- | --- |
| A Task with Nextflow process code | a step that keeps the code |
| A Task that refers to an nf-core module | the nf-core node |
| `InlineDescription`, `SkipTask` or `Monitor` with Nextflow code | channel code |
| Any other Task, and a sub-DAW given by reference only | a **placeholder** step |
| A sub-DAW with its parts | its steps, as a group |
| A Storage with values | Parameters |
| A Storage data comes from / goes to | File Input / Display Output |

A placeholder has the task's name, description, inputs and outputs, and a script that only says
it has no implementation yet. The workflow check lists each one, so the workflow doesn't run
until they are written (in the node's Code tab) or replaced with nodes from the library.
Exported again, a placeholder is a `Task` without an implementation, as it came.

A minimal model:

```json
{
  "schema": "n-wave-daw/1",
  "daw": {
    "id": "average",
    "name": "Average of values",
    "tasks": [
      { "id": "sum", "name": "Sum", "type": "Task", "description": "Add up the values." },
      { "id": "count", "name": "Count", "type": "Task" }
    ],
    "storages": [{ "id": "input", "name": "Values", "type": "FileStorage" }],
    "interconnections": [
      { "id": "i1", "type": "StreamingInterconnection", "from": { "element": "input" }, "to": { "element": "sum" } },
      { "id": "i2", "type": "StreamingInterconnection", "from": { "element": "input" }, "to": { "element": "count" } }
    ]
  }
}
```

## The file format

The metamodel is a class diagram and has no file format of its own, so the JSON is N-WAVE's
form of it (`"schema": "n-wave-daw/1"`), with a
[JSON Schema](https://github.com/HCIstudio/N-WAVE/blob/main/frontend/src/metamodel/daw-model.schema.json)
for other tools. Each element's `type` is a class of the metamodel. Two things go beyond it:

- **Ports.** The metamodel connects elements; N-WAVE also needs to know which output goes to
  which input, so the ends of an interconnection can name a `port`.
- **`nwave`.** What has no class in the metamodel, and what N-WAVE needs to give its own
  canvas back exactly: each node's settings and position, notes, and the workflow's run
  settings. Other tools can ignore it and leave it out.

## See also

- [Importing workflows](https://github.com/HCIstudio/N-WAVE/wiki/Importing-Workflows) and
  [Exporting projects](https://github.com/HCIstudio/N-WAVE/wiki/Exporting-Projects): the same
  for Nextflow code
- [Building workflows](https://github.com/HCIstudio/N-WAVE/wiki/Building-Workflows)
