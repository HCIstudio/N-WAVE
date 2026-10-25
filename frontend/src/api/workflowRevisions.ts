// Saved workflows that changed on the server because of something done in
// this tab (saving or deleting a custom node). The open editor made the same
// change itself, so it takes the new revision instead of treating it as a
// change made elsewhere.

import type { WorkflowRevisionChange } from "../types/backend";

type Listener = (changes: WorkflowRevisionChange[]) => void;

const listeners = new Set<Listener>();

export const onWorkflowRevisions = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const announceWorkflowRevisions = (
  changes: WorkflowRevisionChange[] | undefined,
): void => {
  if (!changes?.length) return;
  for (const listener of listeners) listener(changes);
};
