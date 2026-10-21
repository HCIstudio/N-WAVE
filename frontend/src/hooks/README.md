# Shared hooks

Hooks used by more than one part of the app. Hooks that belong to the workflow editor alone
live next to it in `src/pages/workflow/` (running, checking, history, shortcuts, resume…).

| Folder | Hooks |
| --- | --- |
| `execution/` | `useExecutionStatus`: reads the streamed Nextflow output into the run panel's progress. |
| `nfcore/` | `useInstalledNfCoreNodes`: loads installed nf-core modules and subworkflows as node definitions. |
| `operator/` | The Filter, Map and Merge logic (`useFilterOperator`, `useMapOperator`, `useMergeOperator`, `useOperatorLogic`, `operatorRegistry`) behind their panels and previews. |
| `ui/` | `useLatestRef` (the latest value for callbacks an effect calls without re-running) and `useOperatorPanel`. |

Import from `src/hooks` (`import { useExecutionStatus } from "../hooks"`). Tests sit next to
the hooks as `*.test.ts`; `src/test/renderHook.ts` renders a hook for them.
