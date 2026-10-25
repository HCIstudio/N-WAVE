// Each saved workflow has a revision that every write raises by one. A write
// names the revision it was based on and only applies while that is still
// the stored one, so a tab with an older copy can't silently overwrite a
// newer save (or what a custom node update changed).

import WorkflowModel from "../models/WorkflowModel";
import type { WorkflowEdge, WorkflowNode } from "./types";

/** A workflow that one write moved from one revision to the next. */
export interface WorkflowRevisionChange {
  id: string;
  from: number;
  to: number;
}

export const revisionOf = (workflow: { revision?: number | null }): number =>
  workflow.revision ?? 0;

/** Matches the workflow only while it is at `revision`. */
export const atRevision = (id: string, revision: number) =>
  revision === 0
    ? // Workflows saved before revisions existed have none: they are at 0.
      { _id: id, $or: [{ revision: 0 }, { revision: { $exists: false } }] }
    : { _id: id, revision };

/** Raises the revision along with an update. */
export const withNextRevision = (changes: object) => ({
  $set: changes,
  $inc: { revision: 1 },
});

type GraphChange = { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null;

/** How often a change is re-applied when the workflow was saved meanwhile. */
const MAX_ATTEMPTS = 5;

/**
 * Change the graph of every workflow matching `filter`, each at the revision
 * it was read at: one saved meanwhile is read again and changed again.
 * `change` returns null to leave a workflow as it is.
 */
export const changeWorkflowGraphs = async (
  filter: object,
  change: (workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }) => GraphChange
): Promise<WorkflowRevisionChange[]> => {
  const changes: WorkflowRevisionChange[] = [];
  for (const found of await WorkflowModel.find(filter)) {
    const id = String(found._id);
    let workflow: typeof found | null = found;
    for (let attempt = 0; workflow && attempt < MAX_ATTEMPTS; attempt += 1) {
      const next = change({ nodes: workflow.nodes ?? [], edges: workflow.edges ?? [] });
      if (!next) break;
      const from = revisionOf(workflow);
      const updated = await WorkflowModel.findOneAndUpdate(
        atRevision(id, from),
        withNextRevision(next),
        { returnDocument: "after" }
      );
      if (updated) {
        changes.push({ id, from, to: revisionOf(updated) });
        break;
      }
      if (attempt === MAX_ATTEMPTS - 1) {
        throw new Error(`Workflow ${id} kept changing while it was being updated`);
      }
      workflow = await WorkflowModel.findById(id);
    }
  }
  return changes;
};
