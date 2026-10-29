/** The name a workflow has until it's given one. */
export const UNTITLED_WORKFLOW = "Untitled Workflow";

/** What a name field starts with: empty for an unnamed workflow (the name is its placeholder). */
export const nameForEditing = (name: string): string =>
  name.trim() === UNTITLED_WORKFLOW ? "" : name;

/** The name a field saves: an emptied field leaves the workflow unnamed. */
export const nameFromEditing = (draft: string): string =>
  draft.trim() || UNTITLED_WORKFLOW;
