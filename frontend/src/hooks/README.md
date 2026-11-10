# Shared hooks

Hooks used by more than one part of the app. Hooks that belong to the workflow editor alone
live next to it in `src/pages/workflow/` (running, checking, history, shortcuts, resume…).

| Folder | Hooks |
| --- | --- |
| `execution/` | `useExecutionStatus`: reads the streamed Nextflow output into the run panel's progress. |
| `nfcore/` | `useInstalledNfCoreNodes`: loads installed nf-core modules and subworkflows as node definitions. |
| `operator/` | What the Filter, Map and Merge operators make of their files (`operatorPreview.ts`: one function each, and `useOperatorPreview` for the node). |
| `ui/` | `useLatestRef` (the latest value for callbacks an effect calls without re-running) and `useOperatorPanel`. |

Import from `src/hooks` (`import { useExecutionStatus } from "../hooks"`). Tests sit next to
the hooks as `*.test.ts`; `src/test/renderHook.ts` renders a hook for them.
