// Which edits the canvas accepts. While a run goes the workflow is locked:
// the run uses what was on the canvas when it started, so edits would only
// be confusing (and are lost if the run's results don't match them). A
// read-only workflow (a built-in demo) is copied on its first edit.

import { useCallback } from "react";
import type {
  Connection,
  EdgeChange,
  NodeChange,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
} from "@xyflow/react";
import type { ToastType } from "../../components/common";

export const RUN_LOCK_MESSAGE =
  "The workflow is locked while it runs. Wait for the run to finish, or cancel it, to make changes.";

const isDrag = (change: NodeChange) =>
  change.type === "position" && Boolean((change as { dragging?: boolean }).dragging);

/** While a run goes: selecting and measuring still work; nothing else. */
export const nodeChangesWhileRunning = (changes: NodeChange[]) => ({
  allowed: changes.filter(
    (change) => change.type === "select" || change.type === "dimensions",
  ),
  blocked: changes.some(
    (change) =>
      change.type === "remove" ||
      change.type === "add" ||
      change.type === "replace" ||
      isDrag(change),
  ),
});

/**
 * In a read-only workflow: canvas-internal changes (selection, sizes)
 * apply; dragging or removing a node asks for an editable copy.
 */
export const nodeChangesWhileReadOnly = (
  changes: NodeChange[],
): { allowed: NodeChange[]; wantsCopy: boolean } => ({
  allowed: changes.filter(
    (change) =>
      change.type !== "position" &&
      change.type !== "remove" &&
      change.type !== "add" &&
      change.type !== "replace",
  ),
  wantsCopy: changes.some(
    (change) => isDrag(change) || change.type === "remove",
  ),
});

export const edgeChangesWhileRunning = (changes: EdgeChange[]) => ({
  allowed: changes.filter((change) => change.type === "select"),
  blocked: changes.some((change) => change.type !== "select"),
});

export const edgeChangesWhileReadOnly = (
  changes: EdgeChange[],
): { allowed: EdgeChange[]; wantsCopy: boolean } => ({
  allowed: changes.filter(
    (change) =>
      change.type !== "remove" &&
      change.type !== "add" &&
      change.type !== "replace",
  ),
  wantsCopy: changes.some((change) => change.type === "remove"),
});

interface Options {
  isRunning: boolean;
  readOnly: boolean;
  duplicateReadOnlyWorkflow: () => Promise<boolean>;
  showToast: (message: string, type: ToastType) => void;
  setIsDirty: (dirty: boolean) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
}

export const useEditGuards = ({
  isRunning,
  readOnly,
  duplicateReadOnlyWorkflow,
  showToast,
  setIsDirty,
  onNodesChange,
  onEdgesChange,
  onConnect,
}: Options) => {
  /** True (and says why) when a run locks the workflow. */
  const blockedByRun = useCallback(() => {
    if (!isRunning) return false;
    showToast(RUN_LOCK_MESSAGE, "info");
    return true;
  }, [isRunning, showToast]);

  /**
   * Whether an edit may go ahead here. A read-only workflow is copied
   * instead (the edit is then made in the copy by the user).
   */
  const canEdit = useCallback(() => {
    if (blockedByRun()) return false;
    if (!readOnly) return true;
    void duplicateReadOnlyWorkflow();
    return false;
  }, [blockedByRun, readOnly, duplicateReadOnlyWorkflow]);

  /** Like canEdit, but waits for the copy to be made. */
  const ensureEditable = useCallback(async () => {
    if (blockedByRun()) return false;
    if (!readOnly) return true;
    await duplicateReadOnlyWorkflow();
    return false;
  }, [blockedByRun, readOnly, duplicateReadOnlyWorkflow]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (isRunning) {
        const { allowed, blocked } = nodeChangesWhileRunning(changes);
        if (blocked) blockedByRun();
        if (allowed.length > 0) onNodesChange(allowed);
        return;
      }
      if (readOnly) {
        const { allowed, wantsCopy } = nodeChangesWhileReadOnly(changes);
        if (wantsCopy) void duplicateReadOnlyWorkflow();
        if (allowed.length > 0) {
          onNodesChange(allowed);
          // Selection isn't an edit worth saving.
          setIsDirty(false);
        }
        return;
      }
      onNodesChange(changes);
    },
    [
      isRunning,
      readOnly,
      blockedByRun,
      onNodesChange,
      duplicateReadOnlyWorkflow,
      setIsDirty,
    ],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (isRunning) {
        const { allowed, blocked } = edgeChangesWhileRunning(changes);
        if (blocked) blockedByRun();
        if (allowed.length > 0) onEdgesChange(allowed);
        return;
      }
      if (readOnly) {
        const { allowed, wantsCopy } = edgeChangesWhileReadOnly(changes);
        if (wantsCopy) void duplicateReadOnlyWorkflow();
        if (allowed.length > 0) {
          onEdgesChange(allowed);
          setIsDirty(false);
        }
        return;
      }
      onEdgesChange(changes);
    },
    [
      isRunning,
      readOnly,
      blockedByRun,
      onEdgesChange,
      duplicateReadOnlyWorkflow,
      setIsDirty,
    ],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (canEdit()) onConnect(connection);
    },
    [canEdit, onConnect],
  );

  return {
    blockedByRun,
    canEdit,
    ensureEditable,
    handleNodesChange,
    handleEdgesChange,
    handleConnect,
  };
};
