# Shared components

Components used across pages, grouped by kind. Import them from the folder's `index.ts`
(`import { Modal } from "../common"`); tests sit next to each component.

| Folder | What's in it |
| --- | --- |
| `ui/` | Small building blocks: `Panel`, `Toast`, `LoadingIndicator`, `DynamicIcon` (lucide icons by name, `iconRegistry.ts`), error boundaries and fallbacks, and `Term` (the ⓘ glossary popover). |
| `forms/` | Inputs (`SearchInput`, `InlineEdit`, `MemoryInput`, `TimeInput`, `FormComponents`), the Add node menu (`ProcessDropdown`) and its dialogs: `NfCoreLibraryModal`, `CustomNodeModal`, `NodePacksModal`. |
| `dialogs/` | `Modal` (the base dialog, above the settings dialog and run panel), `ConfirmDialog`, `ActionDialog`. |
| `data/` | Viewers for file contents: `FileViewer`, `CsvViewer`, `JsonViewer`, `CodeBlock`. |
| `workflow/` | Workflow-level UI: `NewWorkflowDialog`, `WorkflowPreview`, `NodeKindLegend`, `ExecutionSettings` with `RunProfilesSettings` and `RunCacheSettings`, the run panel (`ExecutionStatusPanel`, `RunHistory`, `RunResultsList`, `FailureExplanationCard`) and `WorkflowExecutionErrorNotification`. |

Guidelines:

- Dialogs build on `Modal`, so focus, Escape and stacking work the same everywhere.
- Every control gets an accessible name (a visible label or `aria-label`); tests find
  elements by role and name, as users of assistive technology do.
- Terms novices may not know get a `<Term id="…">` with an entry in
  `src/glossary/glossary.ts`.
