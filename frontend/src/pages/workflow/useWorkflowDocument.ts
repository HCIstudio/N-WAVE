// The open workflow as a document: loading it, saving it (and saving
// automatically), its name and settings, copying a read-only one (after
// asking the user), and noticing when it was saved elsewhere meanwhile.

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import type { Edge, Node, XYPosition } from "@xyflow/react";
import api from "../../api";
import { onWorkflowRevisions } from "../../api/workflowRevisions";
import type { NodeData } from "../../components/nodes/BaseNode";
import { useLatestRef } from "../../hooks";
import type { WorkflowDescriptor } from "../../types/backend";
import type { ExecutionSettings } from "../../types/execution";
import {
  getApiErrorMessage,
  getResponseData,
  getResponseStatus,
} from "../../utils/errors";
import {
  DEFAULT_EXECUTION_SETTINGS,
  ensureStoredExecutionSettings,
  migrateExecutionSettings,
  readStoredExecutionSettings,
  storeExecutionSettings,
} from "./executionSettings";
import {
  hydrateEdges,
  hydrateNodes,
  type LoadError,
  loadErrorFor,
  sanitizeNodesForSave,
} from "./workflowDocument";
import { UNTITLED_WORKFLOW } from "../../utils/workflowName";

/** What an editable copy takes over from the read-only original. */
export interface CopyOptions {
  /** Nodes the user moved, by ID: the copy has them there. */
  positions?: Record<string, XYPosition>;
  /** Called with the copy's ID once it exists. */
  onCopied?: (copyId: string) => void;
}

/** Navigation state of a fresh copy: its name and what it was copied from. */
export interface CopiedFromState {
  copiedFrom: string;
  copyName: string;
}

/** An edit waiting for the user to agree to a copy. */
interface PendingCopy {
  options?: CopyOptions;
  resolvers: ((copied: boolean) => void)[];
}

/** The workflow was saved elsewhere since this tab loaded or saved it. */
export interface SaveConflict {
  /** The stored revision this tab's changes would overwrite. */
  storedRevision: number;
}

/** Saves happen this long after the last change. */
const AUTOSAVE_DELAY_MS = 2000;
/** How long the saved checkmark shows. */
const SAVED_INDICATOR_MS = 2000;

interface Options {
  workflowId: string | undefined;
  nodes: Node<NodeData>[];
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  showError: (message: string) => void;
  /** Tells the user something happened that they didn't do (a newer version loaded). */
  showNotice?: (message: string) => void;
}

export const useWorkflowDocument = ({
  workflowId,
  nodes,
  edges,
  setNodes,
  setEdges,
  isDirty,
  setIsDirty,
  showError,
  showNotice,
}: Options) => {
  const navigate = useNavigate();
  const [workflowName, setWorkflowName] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [rawSource, setRawSource] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [sourceFormat, setSourceFormat] = useState<"visual" | "nextflow">(
    "visual",
  );
  const [isLoading, setIsLoading] = useState(true);
  // A workflow that can't be loaded replaces the editor with an error screen.
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [executionSettings, setExecutionSettings] = useState<ExecutionSettings>(
    DEFAULT_EXECUTION_SETTINGS,
  );
  // The stored revision this tab's graph is based on; saves send it back.
  const revision = useRef<number | undefined>(undefined);
  // Changes this tab made through custom node updates, from -> to: the
  // editor made them too, so it moves along them (see adoptOwnRevisions).
  const ownRevisions = useRef(new Map<number, number>());
  const [conflict, setConflict] = useState<SaveConflict | null>(null);

  const load = useCallback(async () => {
    if (!workflowId) {
      setLoadError({
        title: "No workflow selected",
        detail: "The address doesn't include a workflow ID.",
      });
      setIsLoading(false);
      return;
    }
    try {
      const { data } = await api.get<WorkflowDescriptor>(
        `/workflows/${workflowId}`,
      );
      revision.current = data.revision;
      ownRevisions.current.clear();
      setConflict(null);
      setWorkflowName(data.name?.trim() ? data.name : UNTITLED_WORKFLOW);
      setReadOnly(Boolean(data.isReadOnly || data.origin?.readOnly));
      setRawSource(data.rawSource ?? null);
      setImportWarnings(data.importWarnings ?? []);
      setSourceFormat(data.origin?.sourceFormat ?? "visual");

      const loadedNodes = hydrateNodes(data.nodes || []);
      setNodes(loadedNodes);
      setEdges(hydrateEdges(data.edges || [], loadedNodes));

      // The workflow's own settings win; without them, the last used ones.
      if (data.executionSettings) {
        const settings = migrateExecutionSettings(data.executionSettings);
        storeExecutionSettings(settings);
        setExecutionSettings(settings);
      } else {
        const stored = readStoredExecutionSettings();
        if (stored) setExecutionSettings(stored);
      }
      setIsDirty(false);
    } catch (error) {
      console.error(error);
      setLoadError(loadErrorFor(error));
    } finally {
      setIsLoading(false);
    }
  }, [workflowId, setNodes, setEdges, setIsDirty]);

  useEffect(() => {
    void load();
  }, [load]);

  // The settings dialog reads the stored settings: start it with defaults.
  useEffect(() => {
    ensureStoredExecutionSettings();
  }, []);

  const retryLoad = useCallback(() => {
    setLoadError(null);
    setIsLoading(true);
    void load();
  }, [load]);

  /** Open an editable copy of a read-only workflow (e.g. a built-in demo). */
  const duplicateReadOnlyWorkflow = useCallback(
    async (options?: CopyOptions) => {
      if (!workflowId || !readOnly || isDuplicating) return false;
      try {
        setIsDuplicating(true);
        const response = await api.post<WorkflowDescriptor>(
          `/workflows/${workflowId}/duplicate`,
        );
        const copy = response.data;
        const positions = options?.positions ?? {};
        if (Object.keys(positions).length > 0) {
          await api.put(`/workflows/${copy._id}`, {
            nodes: (copy.nodes ?? []).map((node) =>
              positions[node.id]
                ? { ...node, position: positions[node.id] }
                : node,
            ),
          });
        }
        if (copy._id) options?.onCopied?.(copy._id);
        navigate(`/workflow/${copy._id}`, {
          state: {
            copiedFrom: workflowName,
            copyName: copy.name ?? `${workflowName} Copy`,
          } satisfies CopiedFromState,
        });
        return true;
      } catch (error) {
        showError(
          `Failed to duplicate read-only workflow. ${getApiErrorMessage(error, "")}`.trim(),
        );
        console.error(error);
        setIsDuplicating(false);
        return false;
      }
    },
    [workflowId, readOnly, isDuplicating, workflowName, navigate, showError],
  );

  // An edit of a read-only workflow asks first; nothing is copied meanwhile.
  // Edits while the question is open wait for the same answer.
  const pendingCopy = useRef<PendingCopy | null>(null);
  const [isCopyPromptOpen, setIsCopyPromptOpen] = useState(false);

  /** Ask for an editable copy; resolves to whether it was made. */
  const requestCopy = useCallback(
    (options?: CopyOptions) => {
      if (!workflowId || !readOnly || isDuplicating) {
        return Promise.resolve(false);
      }
      return new Promise<boolean>((resolve) => {
        if (pendingCopy.current) {
          pendingCopy.current.resolvers.push(resolve);
          return;
        }
        pendingCopy.current = { options, resolvers: [resolve] };
        setIsCopyPromptOpen(true);
      });
    },
    [workflowId, readOnly, isDuplicating],
  );

  const takePendingCopy = useCallback(() => {
    const pending = pendingCopy.current;
    pendingCopy.current = null;
    setIsCopyPromptOpen(false);
    return pending;
  }, []);

  const confirmCopy = useCallback(async () => {
    const pending = takePendingCopy();
    if (!pending) return;
    const copied = await duplicateReadOnlyWorkflow(pending.options);
    for (const resolve of pending.resolvers) resolve(copied);
  }, [takePendingCopy, duplicateReadOnlyWorkflow]);

  /** Keep looking: the workflow goes back to how it is (e.g. a moved node). */
  const declineCopy = useCallback(() => {
    const pending = takePendingCopy();
    if (!pending) return;
    for (const resolve of pending.resolvers) resolve(false);
    void load();
  }, [takePendingCopy, load]);

  // What is on the page now, and what the last failed save sent: a save
  // only marks the workflow saved if nothing changed while it was sent, and
  // a failed one isn't retried until something changes.
  const current = useLatestRef({ nodes, edges, workflowName, executionSettings });
  const failedSave = useRef<typeof current.current | null>(null);
  const isUnchangedSince = (snapshot: typeof current.current | null) =>
    snapshot !== null &&
    snapshot.nodes === current.current.nodes &&
    snapshot.edges === current.current.edges &&
    snapshot.workflowName === current.current.workflowName &&
    snapshot.executionSettings === current.current.executionSettings;

  /** Move along the revisions this tab's own custom node updates made. */
  const adoptOwnRevisions = useCallback(() => {
    let next =
      revision.current === undefined
        ? undefined
        : ownRevisions.current.get(revision.current);
    while (next !== undefined) {
      ownRevisions.current.delete(revision.current as number);
      revision.current = next;
      next = ownRevisions.current.get(next);
    }
  }, []);

  useEffect(
    () =>
      onWorkflowRevisions((changes) => {
        for (const change of changes) {
          if (change.id === workflowId)
            ownRevisions.current.set(change.from, change.to);
        }
        adoptOwnRevisions();
      }),
    [workflowId, adoptOwnRevisions],
  );

  /**
   * Save. `overwrite` replaces a version saved elsewhere (after a conflict);
   * otherwise a save based on an older revision is refused.
   */
  const save = async ({ overwrite = false }: { overwrite?: boolean } = {}) => {
    if (!workflowId) {
      showError("No workflow ID provided.");
      return;
    }
    if (readOnly) {
      await requestCopy();
      return;
    }
    const sent = current.current;
    const baseRevision = overwrite
      ? conflict?.storedRevision
      : revision.current;
    let saveAgain = false;
    setIsSaving(true);
    try {
      const { data } = await api.put<WorkflowDescriptor>(
        `/workflows/${workflowId}`,
        {
          name: workflowName,
          nodes: sanitizeNodesForSave(nodes),
          edges,
          executionSettings,
          ...(baseRevision === undefined ? {} : { baseRevision }),
        },
      );
      revision.current = data?.revision;
      adoptOwnRevisions();
      setConflict(null);
      failedSave.current = null;
      // An edit made while this was sent is still to be saved.
      if (isUnchangedSince(sent)) setIsDirty(false);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), SAVED_INDICATOR_MS);
    } catch (error) {
      if (getResponseStatus(error) === 409) {
        const stored = getResponseData(error)?.revision;
        const storedRevision = typeof stored === "number" ? stored : undefined;
        // Moved on by a custom node update made here (it landed while this
        // was sent): not a conflict, save again from the new revision.
        adoptOwnRevisions();
        if (
          storedRevision !== undefined &&
          storedRevision === revision.current &&
          storedRevision !== baseRevision
        ) {
          saveAgain = true;
        } else {
          setConflict({
            storedRevision: storedRevision ?? (revision.current ?? 0) + 1,
          });
        }
      } else {
        failedSave.current = sent;
        showError(
          `Failed to save workflow. ${getApiErrorMessage(error, "")}`.trim(),
        );
        console.error(error);
      }
    } finally {
      setIsSaving(false);
    }
    if (saveAgain) await saveRef.current();
  };

  // Save automatically after the last change. The timer restarts whenever
  // the graph changes; it calls the latest save so it never saves a stale
  // snapshot.
  const saveRef = useLatestRef(save);
  // biome-ignore lint/correctness/useExhaustiveDependencies: nodes and edges restart the debounce timer.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        isDirty &&
        !isSaving &&
        workflowId &&
        !readOnly &&
        // Saving now would overwrite the other version: the user decides.
        !conflict &&
        !isUnchangedSince(failedSave.current)
      ) {
        saveRef.current();
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    isDirty,
    isSaving,
    workflowId,
    nodes,
    edges,
    readOnly,
    conflict,
    saveRef,
  ]);

  // Coming back to the tab: a workflow saved elsewhere meanwhile is shown
  // as saved when nothing here is unsaved, else it is a conflict now
  // rather than at the next save.
  const isDirtyRef = useLatestRef(isDirty);
  useEffect(() => {
    if (!workflowId || readOnly) return;
    const check = async () => {
      if (
        document.visibilityState !== "visible" ||
        revision.current === undefined
      )
        return;
      try {
        const { data } = await api.get<WorkflowDescriptor>(
          `/workflows/${workflowId}`,
        );
        adoptOwnRevisions();
        if (data.revision === undefined || data.revision === revision.current)
          return;
        if (isDirtyRef.current) {
          setConflict({ storedRevision: data.revision });
        } else {
          void load();
          showNotice?.(
            "This workflow was changed in another tab (or by a custom node update); the newer version is shown now.",
          );
        }
      } catch {
        // The next save tells.
      }
    };
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [workflowId, readOnly, load, isDirtyRef, adoptOwnRevisions, showNotice]);

  /** Conflict: show the version saved elsewhere (this tab's changes go). */
  const reloadSaved = useCallback(() => {
    setConflict(null);
    void load();
  }, [load]);

  /** Conflict: keep this tab's version as a new workflow, and open it. */
  const saveAsCopy = useCallback(async () => {
    try {
      const { data } = await api.post<WorkflowDescriptor>("/workflows", {
        name: `${workflowName} (my version)`,
        nodes: sanitizeNodesForSave(nodes),
        edges,
        executionSettings,
      });
      setConflict(null);
      setIsDirty(false);
      navigate(`/workflow/${data._id}`);
    } catch (error) {
      showError(
        `Failed to save a copy. ${getApiErrorMessage(error, "")}`.trim(),
      );
    }
  }, [
    workflowName,
    nodes,
    edges,
    executionSettings,
    setIsDirty,
    navigate,
    showError,
  ]);

  /** Conflict: replace the version saved elsewhere with this tab's. */
  const overwriteSaved = () => saveRef.current({ overwrite: true });

  /** New settings from the settings dialog: kept, stored and saved. */
  const changeExecutionSettings = useCallback(
    (settings: ExecutionSettings) => {
      setExecutionSettings(settings);
      storeExecutionSettings(settings);
      setIsDirty(true);
    },
    [setIsDirty],
  );

  const rename = useCallback(
    (name: string) => {
      setWorkflowName(name);
      setIsDirty(true);
    },
    [setIsDirty],
  );

  return {
    workflowName,
    rename,
    readOnly,
    rawSource,
    importWarnings,
    sourceFormat,
    isLoading,
    loadError,
    retryLoad,
    isSaving,
    isSaved,
    save: () => save(),
    conflict,
    reloadSaved,
    saveAsCopy,
    overwriteSaved,
    requestCopy,
    isCopyPromptOpen,
    confirmCopy,
    declineCopy,
    executionSettings,
    /** Settings a run used, kept for retrying it (not saved). */
    setExecutionSettings,
    changeExecutionSettings,
  };
};
