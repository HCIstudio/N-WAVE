# Nextflow script generator

Turns the canvas (React Flow nodes and edges) into a Nextflow DSL2 script. Runs and
"Export project" both use it; the backend only rewrites the script for running (see
`backend/src/execution/nextflowScript.ts`).

```
generators/
├── core/
│   ├── generateNextflowScript.ts  # nodes + edges -> script
│   ├── helpers.ts                 # top-level Groovy helpers, emitted only when used
│   └── templateEngine.ts          # picks the template for a process, operator or output
├── templates/
│   ├── processes.ts               # the generic process
│   ├── operators.ts               # Filter, Map and Merge processes
│   └── outputs.ts                 # Display Output (save results)
└── index.ts
```

Most nodes don't use these templates: a node's definition in `src/registry/` generates
its own code (`generateNextflow`), and `generateNextflowScript` wires the channels
between them.

## Usage

```ts
import { generateNextflowScript } from "../generators";

const script = generateNextflowScript(nodes, edges, "My workflow", "results", "{workflow_name}");
```

## Testing

`core/generateNextflowScript.test.ts` and the registry tests check the generated code;
`scripts/lint-generated-nextflow.sh` runs `nextflow lint` on the scripts the examples
and node combinations generate (the "Generated Nextflow (lint)" CI job).
