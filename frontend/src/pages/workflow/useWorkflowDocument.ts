// The open workflow as a document: loading it, saving it (and saving
// automatically), its name and settings, and copying a read-only one.

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useNavigate } from "react-router";
import type { Edge, Node, XYPosition } from "@xyflow/react";
import api from "../../api";
import type { NodeData } from "../../components/nodes/BaseNode";
import { useLatestRef } from "../../hooks";
import type { WorkflowDescriptor } from "../../types/backend";
import type { ExecutionSettings } from "../../types/execution";
import { getApiErrorMessage } from "../../utils/errors";
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

/** What an editable copy takes over from the read-only original. */
export interface CopyOptions {
  /** Nodes the user moved, by ID: the copy has them there. */
  positions?: Record<string, XYPosition>;
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
      setWorkflowName(data.name?.trim() ? data.name : "Untitled Workflow");
      setReadOnly(Boolean(data.isReadOnly || data.origin?.readOnly));
      setRawSource(data.rawSource ?? null);
      setImportWarnings(data.importWarnings ?? []);
      setSourceFormat(data.origin?.sourceFormat ?? "visual");

      const loadedNodes = hydrateNodes(data.nodes || []);
      setNodes(loadedNodes);
      setEdges(
        hydrateEdges(data.edges || [], loadedNodes, (edgeId) =>
          setEdges((current) => current.filter((edge) => edge.id !== edgeId)),
        ),
      );

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
    async (
      options?: CopyOptions & { onCopied?: (copyId: string) => void },
    ) => {
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
        navigate(`/workflow/${copy._id}`);
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
    [workflowId, readOnly, isDuplicating, navigate, showError],
  );

  const save = async () => {
    if (!workflowId) {
      showError("No workflow ID provided.");
      return;
    }
    if (readOnly) {
      await duplicateReadOnlyWorkflow();
      return;
    }
    setIsSaving(true);
    try {
      await api.put(`/workflows/${workflowId}`, {
        name: workflowName,
        nodes: sanitizeNodesForSave(nodes),
        edges,
        executionSettings,
      });
      setIsDirty(false);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), SAVED_INDICATOR_MS);
    } catch (error) {
      showError(
        `Failed to save workflow. ${getApiErrorMessage(error, "")}`.trim(),
      );
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  // Save automatically after the last change. The timer restarts whenever
  // the graph changes; it calls the latest save so it never saves a stale
  // snapshot.
  const saveRef = useLatestRef(save);
  // biome-ignore lint/correctness/useExhaustiveDependencies: nodes and edges restart the debounce timer.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isDirty && !isSaving && workflowId && !readOnly) {
        saveRef.current();
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isDirty, isSaving, workflowId, nodes, edges, readOnly, saveRef]);

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
    save,
    duplicateReadOnlyWorkflow,
    executionSettings,
    /** Settings a run used, kept for retrying it (not saved). */
    setExecutionSettings,
    changeExecutionSettings,
  };
};
