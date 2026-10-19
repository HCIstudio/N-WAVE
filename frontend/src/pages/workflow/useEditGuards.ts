// Which edits the canvas accepts. While a run goes the workflow is locked:
// the run uses what was on the canvas when it started, so edits would only
// be confusing (and are lost if the run's results don't match them). A
// read-only workflow (a built-in demo) offers a copy on its first edit.

import { useCallback } from "react";
import type {
  Connection,
  EdgeChange,
  NodeChange,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
  XYPosition,
} from "@xyflow/react";
import type { ToastType } from "../../components/common";
import type { CopyOptions } from "./useWorkflowDocument";

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

/** Where the nodes a finished drag moved ended up, by node ID. */
const droppedPositions = (changes: NodeChange[]): Record<string, XYPosition> =>
  Object.fromEntries(
    changes.flatMap((change) =>
      change.type === "position" && change.dragging === false && change.position
        ? [[change.id, change.position]]
        : [],
    ),
  );

/**
 * In a read-only workflow: canvas-internal changes (selection, sizes) and
 * dragging apply; a finished drag or removing a node asks for an editable
 * copy, which keeps where the drag left the nodes (`moved`).
 */
export const nodeChangesWhileReadOnly = (
  changes: NodeChange[],
): {
  allowed: NodeChange[];
  wantsCopy: boolean;
  moved: Record<string, XYPosition>;
} => {
  const moved = droppedPositions(changes);
  return {
    allowed: changes.filter(
      (change) =>
        change.type !== "remove" &&
        change.type !== "add" &&
        change.type !== "replace",
    ),
    wantsCopy:
      Object.keys(moved).length > 0 ||
      changes.some((change) => change.type === "remove"),
    moved,
  };
};

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
  requestCopy: (options?: CopyOptions) => Promise<boolean>;
  showToast: (message: string, type: ToastType) => void;
  setIsDirty: (dirty: boolean) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
}

export const useEditGuards = ({
  isRunning,
  readOnly,
  requestCopy,
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
   * Whether an edit may go ahead here. A read-only workflow offers a copy
   * instead (the edit is then made in the copy by the user).
   */
  const canEdit = useCallback(() => {
    if (blockedByRun()) return false;
    if (!readOnly) return true;
    void requestCopy();
    return false;
  }, [blockedByRun, readOnly, requestCopy]);

  /** Like canEdit, but waits for the answer (and the copy). */
  const ensureEditable = useCallback(async () => {
    if (blockedByRun()) return false;
    if (!readOnly) return true;
    await requestCopy();
    return false;
  }, [blockedByRun, readOnly, requestCopy]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (isRunning) {
        const { allowed, blocked } = nodeChangesWhileRunning(changes);
        if (blocked) blockedByRun();
        if (allowed.length > 0) onNodesChange(allowed);
        return;
      }
      if (readOnly) {
        const { allowed, wantsCopy, moved } = nodeChangesWhileReadOnly(changes);
        if (wantsCopy) void requestCopy({ positions: moved });
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
      requestCopy,
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
        if (wantsCopy) void requestCopy();
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
      requestCopy,
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
