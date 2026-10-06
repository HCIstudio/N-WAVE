import type React from "react";
import {
  useState,
  useCallback,
  useEffect,
  useContext,
  useMemo,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ReactFlowProvider, useReactFlow } from "reactflow";
import type { Node } from "reactflow";
import type { FileObject, NodeData } from "../components/nodes/BaseNode";
import Canvas from "../components/canvas/Canvas";
import { PropertiesPanel } from "../components/panels";
import Header from "../components/layout/Header";
import api, { isDemoMode } from "../api";
import type { NextflowProcess } from "../data/types";
import BottomBar from "../components/canvas/BottomBar";
import DeleteDropZone from "../components/canvas/DeleteDropZone";
import { WorkflowContext, WorkflowProvider } from "../context/WorkflowContext";
import { FloatingPanel } from "../components/panels";
import { OutputDisplayPanelContent } from "../components/panels";
import {
  ConfirmDialog,
  ErrorBoundary,
  ErrorFallback,
  Toast,
  WorkflowExecutionErrorNotification,
} from "../components/common";
import ExecutionStatusPanel from "../components/common/workflow/ExecutionStatusPanel";
import CustomNodeModal from "../components/common/forms/CustomNodeModal";
import { useExecutionStatus, useLatestRef } from "../hooks";
import { generateNextflowScript } from "../generators";
import { Loader } from "lucide-react";
import { type ExecutionSettings, ExecutionMode } from "../types/execution";
import type { WorkflowDescriptor } from "../types/backend";
import TutorialCallout from "../components/tutorial/TutorialCallout";
import {
  deleteCustomNode,
  migrateLegacyCustomNodes,
  persistCustomNode,
  refreshCustomNodes,
} from "../api/customNodes";
import { refreshInstalledNfCoreNodes } from "../api/nfcore";
import { getNodeCode } from "../registry/nodeCode";
import {
  buildConvertedNode,
  buildCustomNodeFromNode,
  remapEdges,
} from "../registry/convertToCustomNode";
import type { CustomNodeInput, StoredCustomNode } from "../registry/customNodes";
import { isoDurationToMinutes } from "../utils/duration";
import { getWorkflowInputFiles } from "../utils/inputFiles";
import {
  createLineReader,
  findResourceProblem,
  parseRunId,
} from "../utils/streamLines";
import {
  buildPipelineLaunch,
  pipelineLaunchScript,
} from "../registry/pipelines/launch";
import {
  getApiErrorMessage,
  getResponseData,
  getResponseStatus,
} from "../utils/errors";

const TUTORIAL_COMPLETED_KEY = "nwave.demoTutorial.completed";
const TUTORIAL_ACTIVE_KEY = "nwave.demoTutorial.active";
const TUTORIAL_STEP_KEY = "nwave.demoTutorial.step";
const TUTORIAL_COPY_ID_KEY = "nwave.demoTutorial.copyId";
const TUTORIAL_VERSION = "custom-nodes-v3";

const tutorialSteps = [
  {
    text: (
      <>
        <strong>Input nodes</strong> hold files to process in the workflow.
      </>
    ),
    targetSelector: '.react-flow__node[data-id="demo-file-input"]',
    placement: "above" as const,
  },
  {
    text: (
      <>
        <strong>Processing nodes</strong> take one or more inputs to alter and
        output the results.
      </>
    ),
    targetSelector: '.react-flow__node[data-id="demo-map-uppercase"]',
    placement: "above" as const,
  },
  {
    text: (
      <>
        <strong>Display nodes</strong> display the input they receive for better
        monitoring. All data going into a Display node will be written as
        workflow result files.
      </>
    ),
    targetSelector: '.react-flow__node[data-id="demo-output"]',
    placement: "above" as const,
  },
  {
    text: (
      <>
        Here you can <strong>rename</strong>, <strong>run</strong>,{" "}
        <strong>save</strong> or <strong>download</strong> your workflow.
      </>
    ),
    targetSelector: "[data-tutorial-bottom-bar]",
    placement: "above" as const,
  },
  {
    text: (
      <>
        To <strong>expand the workflow</strong> click here to see a collection of
        all available nodes. Feel free to select one.
      </>
    ),
    targetSelector: "[data-tutorial-add-node]",
    placement: "left-start" as const,
  },
  {
    text: (
      <>
        To <strong>edit</strong> or <strong>delete</strong> a node or view its
        current configuration, simply double-click it.
      </>
    ),
    targetSelector: '.react-flow__node[data-id="demo-map-uppercase"]',
    placement: "above" as const,
  },
  {
    text: "That covers the basics of N-Wave. Feel free to explore the application. If you have further questions click the home button on the bottom to return to the main page. There you can always retake the tutorial or access our wiki for a more extensive explanation on workflow and node functionality.",
    placement: "center" as const,
  },
];

/** Save a blob as a file download. */
const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const WorkflowPageContent: React.FC = () => {
  const workflowContext = useContext(WorkflowContext);
  if (!workflowContext) {
    return <div>Workflow context is not available.</div>;
  }
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodes,
    setEdges,
    updateNodeData,
    setIsDirty,
    isValidConnection,
    onConnectStart,
    onConnectEnd,
    toast,
    closeToast,
    showToast,
  } = workflowContext;
  // Errors from user actions (save, duplicate, script generation) are shown as
  // toasts so the editor stays usable.
  const showError = useCallback(
    (message: string) => showToast(message, "error"),
    [showToast]
  );

  const [openPanelNodeIds, setOpenPanelNodeIds] = useState<string[]>([]);
  const [workflowName, setWorkflowName] = useState("");
  const [workflowReadOnly, setWorkflowReadOnly] = useState(false);
  const [workflowRawSource, setWorkflowRawSource] = useState<string | null>(null);
  const [workflowImportWarnings, setWorkflowImportWarnings] = useState<string[]>([]);
  const [workflowSourceFormat, setWorkflowSourceFormat] = useState<
    "visual" | "nextflow"
  >("visual");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // A workflow that can't be loaded replaces the editor with an error screen.
  const [loadError, setLoadError] = useState<{
    title: string;
    detail: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHoveringDropZone, setIsHoveringDropZone] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<Node<NodeData> | null>(null);
  const [isConnecting] = useState(false);
  const [activePanels, setActivePanels] = useState<string[]>([]);
  const [recenterRequest, setRecenterRequest] = useState<{
    panelId: string;
    timestamp: number;
  } | null>(null);
  const [activePanelNodeId, setActivePanelNodeId] = useState<string | null>(
    null
  );
  const [, setPanelStates] = useState<
    Record<string, { x: number; y: number; width: number; height: number }>
  >({});
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(
    null
  );
  const [, setExecutionResult] = useState<{
    success: boolean;
    output: string;
    error?: string;
  } | null>(null);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [executionError, setExecutionError] = useState<{
    message: string;
    output?: string;
    code?: string | number;
  } | null>(null);
  const [executionSettings, setExecutionSettings] = useState<ExecutionSettings>(
    {
      mode: ExecutionMode.DOCKER,
      nextflow: {
        version: "25.04.4",
        forceVersion: false,
        enableDsl2: true,
        enableTrace: false,
        enableTimeline: false,
        enableReport: false,
      },
      output: {
        directory: "results",
        namingPattern: "{workflow_name}_{timestamp}",
        overwrite: false,
        keepWorkDir: false,
      },
      container: {
        enabled: true,
        defaultImage: "ubuntu:22.04",
        registry: "docker.io",
        pullPolicy: "if-not-present",
        customRunOptions: [],
      },
      resources: {
        maxCpus: 4,
        maxMemory: "4.GB",
        maxTime: "PT30M",
        executor: "local",
      },
      errorHandling: {
        strategy: "terminate",
        maxRetries: 0,
        backoffStrategy: "exponential",
        continueOnError: false,
      },
      environment: {
        profile: "standard",
        customParams: {},
        environmentVariables: {},
      },
      cleanup: {
        onSuccess: false,
        onFailure: false,
        intermediateFiles: false,
        workDirectory: false,
      },
      validation: {
        requireContainer: false,
        allowMissingInputs: false,
        strictChannelTypes: false,
        enableTypeChecking: false,
      },
    }
  );

  const { id: workflowId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { screenToFlowPosition } = useReactFlow();
  const [isDuplicatingReadOnly, setIsDuplicatingReadOnly] = useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(() => {
    if (sessionStorage.getItem(TUTORIAL_ACTIVE_KEY) !== "true") return null;
    const storedStep = Number(sessionStorage.getItem(TUTORIAL_STEP_KEY) ?? "0");
    return Number.isFinite(storedStep)
      ? Math.min(Math.max(storedStep, 0), tutorialSteps.length - 1)
      : 0;
  });
  const isTutorialActive = tutorialStepIndex !== null;
  const [customNodeDeleteCandidate, setCustomNodeDeleteCandidate] =
    useState<StoredCustomNode | null>(null);
  const [customNodeDeleteError, setCustomNodeDeleteError] = useState<
    string | null
  >(null);
  const [editingCustomNode, setEditingCustomNode] =
    useState<StoredCustomNode | null>(null);

  const applyCustomNodeDefinitionToPlacedNodes = useCallback(
    (customNode: StoredCustomNode, markDirty = true) => {
      const pathInputs = customNode.inputs.filter(
        (input) => input.kind === "path"
      );
      const valueInputs = customNode.inputs.filter(
        (input) => input.kind === "val"
      );
      const nextInputs = pathInputs.map((input) => ({
        name: input.name,
        label: input.label,
        fileType: input.fileType,
        filePattern: input.filePattern,
        isConnectable: true,
      }));
      const nextOutputs = customNode.outputs.map((output) => ({
        name: output.name,
        label: output.label,
        fileType: output.fileType,
        filePattern: output.filePattern,
        isConnectable: true,
      }));

      const affectedNodeIds = new Set(
        nodes
          .filter((node) => node.data.customNodeId === customNode.id)
          .map((node) => node.id)
      );
      if (affectedNodeIds.size === 0) return;
      const validInputHandles = new Set(nextInputs.map((input) => input.name));
      const validOutputHandles = new Set(
        nextOutputs.map((output) => output.name)
      );
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.data.customNodeId !== customNode.id) return node;
          const previousValues = node.data.customNodeValues ?? {};
          const nextValues = Object.fromEntries(
            valueInputs.map((input: CustomNodeInput) => [
              input.name,
              previousValues[input.name] ?? input.defaultValue ?? "",
            ])
          );

          return {
            ...node,
            data: {
              ...node.data,
              label: customNode.label,
              subtitle: "Custom node",
              icon: customNode.icon,
              processType: customNode.processType,
              customNodeDefinition: customNode,
              customNodeValueInputs: valueInputs,
              customNodeValues: nextValues,
              inputs: nextInputs,
              outputs: nextOutputs,
            },
          };
        })
      );
      setEdges((currentEdges) =>
        currentEdges.filter((edge) => {
          if (affectedNodeIds.has(edge.source)) {
            return !edge.sourceHandle || validOutputHandles.has(edge.sourceHandle);
          }
          if (affectedNodeIds.has(edge.target)) {
            return !edge.targetHandle || validInputHandles.has(edge.targetHandle);
          }
          return true;
        })
      );
      if (markDirty) setIsDirty(true);
    },
    [nodes, setNodes, setEdges, setIsDirty]
  );

  const purgeCustomNodeFromCurrentWorkflow = useCallback(
    (customNodeId: string) => {
      const removedNodeIds = new Set(
        nodes
          .filter((node) => node.data.customNodeId === customNodeId)
          .map((node) => node.id)
      );
      if (removedNodeIds.size === 0) return;
      setNodes((currentNodes) =>
        currentNodes.filter((node) => !removedNodeIds.has(node.id))
      );
      setEdges((currentEdges) =>
        currentEdges.filter(
          (edge) =>
            !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)
        )
      );
      setIsDirty(true);
    },
    [nodes, setNodes, setEdges, setIsDirty]
  );

  const handleConfirmCustomNodeDelete = useCallback(async () => {
    if (!customNodeDeleteCandidate) return;

    try {
      setCustomNodeDeleteError(null);
      await deleteCustomNode(customNodeDeleteCandidate.id);
      purgeCustomNodeFromCurrentWorkflow(customNodeDeleteCandidate.id);
      await refreshCustomNodes();
      setCustomNodeDeleteCandidate(null);
    } catch (deleteError: unknown) {
      setCustomNodeDeleteError(
        getApiErrorMessage(deleteError, "Failed to delete custom node.")
      );
    }
  }, [customNodeDeleteCandidate, purgeCustomNodeFromCurrentWorkflow]);

  // Register installed nf-core modules and custom nodes, so saved
  // workflows that use them generate code without opening the node menu.
  useEffect(() => {
    refreshInstalledNfCoreNodes().catch(() => 0);
    migrateLegacyCustomNodes()
      .catch(() => 0)
      .finally(() => {
        refreshCustomNodes().catch(() => 0);
      });
  }, []);

  const finishTutorial = useCallback(async () => {
    const tutorialCopyId = sessionStorage.getItem(TUTORIAL_COPY_ID_KEY);

    sessionStorage.removeItem(TUTORIAL_ACTIVE_KEY);
    sessionStorage.removeItem(TUTORIAL_STEP_KEY);
    sessionStorage.removeItem(TUTORIAL_COPY_ID_KEY);
    localStorage.setItem(TUTORIAL_COMPLETED_KEY, TUTORIAL_VERSION);
    setTutorialStepIndex(null);

    if (!tutorialCopyId) return;

    try {
      await api.delete(`/workflows/${tutorialCopyId}`);
      if (workflowId === tutorialCopyId) {
        navigate("/");
      }
    } catch (err) {
      showError("Failed to remove tutorial workflow copy.");
      console.error(err);
    }
  }, [navigate, workflowId, showError]);

  const setTutorialStep = useCallback((stepIndex: number | null) => {
    if (stepIndex === null) {
      sessionStorage.removeItem(TUTORIAL_ACTIVE_KEY);
      sessionStorage.removeItem(TUTORIAL_STEP_KEY);
      localStorage.setItem(TUTORIAL_COMPLETED_KEY, TUTORIAL_VERSION);
      setTutorialStepIndex(null);
      return;
    }

    sessionStorage.setItem(TUTORIAL_ACTIVE_KEY, "true");
    sessionStorage.setItem(TUTORIAL_STEP_KEY, String(stepIndex));
    setTutorialStepIndex(stepIndex);
  }, []);

  const goToPreviousTutorialStep = useCallback(() => {
    setTutorialStepIndex((currentStep) => {
      if (currentStep === null) return currentStep;
      const previousStep = Math.max(currentStep - 1, 0);
      sessionStorage.setItem(TUTORIAL_STEP_KEY, String(previousStep));
      return previousStep;
    });
  }, []);

  const goToNextTutorialStep = useCallback(() => {
    setTutorialStepIndex((currentStep) => {
      if (currentStep === null) return currentStep;
      if (currentStep >= tutorialSteps.length - 1) {
        sessionStorage.removeItem(TUTORIAL_ACTIVE_KEY);
        sessionStorage.removeItem(TUTORIAL_STEP_KEY);
        localStorage.setItem(TUTORIAL_COMPLETED_KEY, TUTORIAL_VERSION);
        return null;
      }

      const nextStep = currentStep + 1;
      sessionStorage.setItem(TUTORIAL_STEP_KEY, String(nextStep));
      return nextStep;
    });
  }, []);

  const duplicateReadOnlyWorkflow = useCallback(async (options?: {
    trackTutorialCopy?: boolean;
  }) => {
    if (!workflowId || !workflowReadOnly || isDuplicatingReadOnly) {
      return false;
    }

    try {
      setIsDuplicatingReadOnly(true);
      const response = await api.post(`/workflows/${workflowId}/duplicate`);
      if (options?.trackTutorialCopy && response.data?._id) {
        sessionStorage.setItem(TUTORIAL_COPY_ID_KEY, response.data._id);
      }
      navigate(`/workflow/${response.data._id}`);
      return true;
    } catch (err) {
      showError(
        `Failed to duplicate read-only workflow. ${getApiErrorMessage(err, "")}`.trim()
      );
      console.error(err);
      setIsDuplicatingReadOnly(false);
      return false;
    }
  }, [workflowId, workflowReadOnly, isDuplicatingReadOnly, navigate, showError]);

  const handleTutorialForward = useCallback(() => {
    if (tutorialStepIndex === 4 && workflowReadOnly) {
      setTutorialStep(5);
      void duplicateReadOnlyWorkflow({ trackTutorialCopy: true }).then((duplicated) => {
        if (!duplicated) {
          setTutorialStep(4);
        }
      });
      return;
    }

    goToNextTutorialStep();
  }, [
    duplicateReadOnlyWorkflow,
    goToNextTutorialStep,
    setTutorialStep,
    tutorialStepIndex,
    workflowReadOnly,
  ]);

  const ensureEditableWorkflow = useCallback(async () => {
    if (!workflowReadOnly) return true;
    await duplicateReadOnlyWorkflow();
    return false;
  }, [workflowReadOnly, duplicateReadOnlyWorkflow]);

  const handleWorkflowNameChange = useCallback(
    (newName: string) => {
      if (workflowReadOnly) {
        void duplicateReadOnlyWorkflow();
        return;
      }
      setWorkflowName(newName);
      setIsDirty(true);
    },
    [workflowReadOnly, duplicateReadOnlyWorkflow, setIsDirty]
  );

  const handleProcessSelect = useCallback(
    (process: NextflowProcess) => {
      if (workflowReadOnly) {
        if (tutorialStepIndex === 4) {
          setTutorialStep(5);
          void duplicateReadOnlyWorkflow({ trackTutorialCopy: true });
          return;
        }
        void duplicateReadOnlyWorkflow();
        return;
      }

      const position = screenToFlowPosition({
        x: window.innerWidth / 2 - 150, // Adjust for panel width
        y: window.innerHeight / 3,
      });

      const newNode: Node<NodeData> = {
        id: `node-${+new Date()}`,
        type: process.type,
        position,
        data: {
          label: process.label,
          icon: process.icon,
          ...process.initialData,
        },
      };

      setNodes((nds) => nds.concat(newNode));
      setIsDirty(true);
      if (tutorialStepIndex === 4) {
        setTutorialStep(5);
      }
    },
    [
      screenToFlowPosition,
      setNodes,
      setIsDirty,
      workflowReadOnly,
      duplicateReadOnlyWorkflow,
      tutorialStepIndex,
      setTutorialStep,
    ]
  );

  // Memoize nodes to prevent unnecessary re-renders, and disable interaction during connection
  const memoizedNodes = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isHighlight: node.id === activePanelNodeId,
      },
      selectable: !isConnecting,
      draggable: !isConnecting && !workflowReadOnly,
      // React Flow marks draggable nodes "nopan"; without it, the canvas's
      // double-click zoom swallows the double-click that opens a panel.
      className: workflowReadOnly
        ? [node.className, "nopan"].filter(Boolean).join(" ")
        : node.className,
    }));
  }, [nodes, isConnecting, activePanelNodeId, workflowReadOnly]);

  // Memoize edges to prevent unnecessary re-renders
  const memoizedEdges = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
    }));
  }, [edges]);

  // Execution status tracking
  const executionStatus = useExecutionStatus({
    nodes: memoizedNodes,
    executionId: currentExecutionId,
    onStatusChange: (status) => {
      // Update node statuses on the canvas based on execution status
      if (status.nodeStatuses.length === 0 && !status.isRunning) {
        // Clear all node statuses when execution is complete and not running
        for (const node of nodes) {
          if (node.data.status) {
            updateNodeData(node.id, { status: undefined });
          }
        }
      } else if (status.nodeStatuses.length > 0) {
        // Update individual node statuses during execution
        for (const nodeStatus of status.nodeStatuses) {
          const nodeIndex = nodes.findIndex((n) => n.id === nodeStatus.nodeId);
          if (nodeIndex !== -1) {
            // Map execution status to node status (excluding 'skipped')
            const nodeStatusValue =
              nodeStatus.status === "skipped" ? "waiting" : nodeStatus.status;
            updateNodeData(nodeStatus.nodeId, { status: nodeStatusValue });
          }
        }
      }
    },
  });

  const fetchWorkflow = useCallback(async () => {
    if (!workflowId) {
      setLoadError({
        title: "No workflow selected",
        detail: "The address doesn't include a workflow ID.",
      });
      setIsLoading(false);
      return;
    }
    try {
      const response = await api.get<WorkflowDescriptor>(`/workflows/${workflowId}`);
      const {
        name,
        nodes: fetchedNodes,
        edges: fetchedEdges,
        executionSettings,
        rawSource,
        importWarnings,
        origin,
      } = response.data;

      const workflowTitle =
        name && name.trim() !== "" ? name : "Untitled Workflow";
      setWorkflowName(workflowTitle);
      setWorkflowReadOnly(
        Boolean(response.data.isReadOnly || response.data.origin?.readOnly)
      );
      setWorkflowRawSource(rawSource ?? null);
      setWorkflowImportWarnings(importWarnings ?? []);
      setWorkflowSourceFormat(origin?.sourceFormat ?? "visual");

      const loadedNodes = fetchedNodes || [];
      setNodes(loadedNodes);

      const hydratedEdges = (fetchedEdges || []).map((edge) => {
        const sourceNode = loadedNodes.find((node) => node.id === edge.source);
        const targetNode = loadedNodes.find((node) => node.id === edge.target);
        const legacyMergeInputMatch = String(edge.targetHandle ?? "").match(
          /^in(\d+)$/
        );

        return {
          ...edge,
          sourceHandle:
            sourceNode?.type === "fileInput" && edge.sourceHandle === "out"
              ? "ch_files_out"
              : edge.sourceHandle,
          targetHandle:
            targetNode?.data?.operatorType === "merge" && legacyMergeInputMatch
              ? "in"
              : edge.targetHandle,
          type: "default",
          data: {
            ...edge.data,
            order:
              typeof edge.data?.order === "number"
                ? edge.data.order
                : legacyMergeInputMatch?.[1]
                  ? Number(legacyMergeInputMatch[1]) - 1
                  : undefined,
            onDelete: (edgeId: string) => {
              setEdges((eds) => eds.filter((e) => e.id !== edgeId));
            },
          },
        };
      });

      setEdges(hydratedEdges);

      // Restore execution settings if they exist in the workflow
      if (executionSettings) {
        try {
          // Update localStorage with the settings from backend
          localStorage.setItem(
            "executionSettings",
            JSON.stringify(executionSettings)
          );

          // Update the component state with the restored settings
          setExecutionSettings(executionSettings);

        } catch (error) {
          console.error("Failed to restore execution settings:", error);
        }
      } else {
        // If no execution settings in backend, try to load from localStorage
        try {
          const savedSettings = localStorage.getItem("executionSettings");
          if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            setExecutionSettings(parsed);
          }
        } catch (error) {
          console.error(
            "Failed to load execution settings from localStorage:",
            error
          );
        }
      }

      setIsDirty(false);
    } catch (err) {
      console.error(err);
      const status = getResponseStatus(err);
      setLoadError(
        status === 404 || status === 400
          ? {
              title: "Workflow not found",
              detail:
                "This workflow doesn't exist or was deleted. Pick another one from the library.",
            }
          : {
              title: "Couldn't load this workflow",
              detail: `${
                isDemoMode
                  ? "The demo's browser storage could not be read."
                  : "The N-WAVE backend did not respond. Make sure it is running and try again."
              } (${getApiErrorMessage(err, "Unknown error")})`,
            }
      );
    } finally {
      setIsLoading(false);
    }
  }, [workflowId, setNodes, setEdges, setIsDirty]);

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      if (workflowReadOnly) {
        const editableChanges = changes.filter(
          (change) =>
            change.type === "position" && (change as { dragging?: boolean }).dragging
        );
        if (editableChanges.length > 0 || changes.some((change) => change.type === "remove")) {
          void duplicateReadOnlyWorkflow();
        }

        const internalChanges = changes.filter(
          (change) =>
            change.type !== "position" &&
            change.type !== "remove" &&
            change.type !== "add" &&
            change.type !== "reset"
        );
        if (internalChanges.length > 0) {
          onNodesChange(internalChanges);
          setIsDirty(false);
        }
        return;
      }
      onNodesChange(changes);
    },
    [onNodesChange, workflowReadOnly, duplicateReadOnlyWorkflow, setIsDirty]
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      if (workflowReadOnly) {
        if (changes.some((change) => change.type === "remove")) {
          void duplicateReadOnlyWorkflow();
        }
        const internalChanges = changes.filter(
          (change) =>
            change.type !== "remove" &&
            change.type !== "add" &&
            change.type !== "reset"
        );
        if (internalChanges.length > 0) {
          onEdgesChange(internalChanges);
          setIsDirty(false);
        }
        return;
      }
      onEdgesChange(changes);
    },
    [onEdgesChange, workflowReadOnly, duplicateReadOnlyWorkflow, setIsDirty]
  );

  const handleConnect = useCallback(
    (connection: Parameters<typeof onConnect>[0]) => {
      if (workflowReadOnly) {
        void duplicateReadOnlyWorkflow();
        return;
      }
      onConnect(connection);
    },
    [onConnect, workflowReadOnly, duplicateReadOnlyWorkflow]
  );

  const handleUpdateNodeData = useCallback(
    async (nodeId: string, data: Partial<NodeData>) => {
      const currentNode = nodes.find((node) => node.id === nodeId);
      const isNoop =
        currentNode &&
        Object.entries(data).every(
          ([key, value]) => currentNode.data[key] === value
        );
      if (isNoop) return;

      if (!(await ensureEditableWorkflow())) return;
      updateNodeData(nodeId, data);
    },
    [nodes, ensureEditableWorkflow, updateNodeData]
  );

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  // Replace a bundled or nf-core node with an editable custom copy, keeping
  // its id, position and the connections whose ports still exist.
  const handleConvertToCustomNode = useCallback(
    async (node: Node<NodeData>, moduleSource?: string) => {
      if (!(await ensureEditableWorkflow())) return;
      const code = getNodeCode(node);
      if (!code) {
        throw new Error("This node has no process code to convert.");
      }
      const { customNode, ports } = buildCustomNodeFromNode(
        node,
        code,
        moduleSource
      );
      const saved = await persistCustomNode(customNode);
      const converted = buildConvertedNode(node, saved);
      const { edges: nextEdges, removed } = remapEdges(edges, node.id, ports);

      setNodes((currentNodes) =>
        currentNodes.map((current) =>
          current.id === node.id ? converted : current
        )
      );
      setEdges(nextEdges);
      setIsDirty(true);
      const label = converted.data.label;
      showToast(
        removed.length > 0
          ? `Converted "${label}" to a custom node. ${removed.length} connection${removed.length === 1 ? " had" : "s had"} no matching port and ${removed.length === 1 ? "was" : "were"} removed.`
          : `Converted "${label}" to a custom node.`,
        removed.length > 0 ? "warning" : "success"
      );
    },
    [edges, ensureEditableWorkflow, setNodes, setEdges, setIsDirty, showToast]
  );

  const handleEditCustomNode = useCallback(
    async (customNodeId: string) => {
      try {
        const stored = await refreshCustomNodes();
        const customNode =
          stored.find((candidate) => candidate.id === customNodeId) ??
          (nodes.find((node) => node.data.customNodeId === customNodeId)?.data
            .customNodeDefinition as StoredCustomNode | undefined);
        if (!customNode) {
          showError("This custom node is no longer in the node library.");
          return;
        }
        setEditingCustomNode(customNode);
      } catch (error: unknown) {
        showError(getApiErrorMessage(error, "Failed to load the custom node."));
      }
    },
    [nodes, showError]
  );

  // Initialize execution settings in localStorage if not present
  useEffect(() => {
    const savedSettings = localStorage.getItem("executionSettings");
    if (!savedSettings) {
      // Set default execution settings if none exist
      const defaultSettings = {
        mode: "docker",
        nextflow: {
          version: "25.04.4",
          forceVersion: false,
          enableDsl2: true,
          enableTrace: false,
          enableTimeline: false,
          enableReport: false,
        },
        output: {
          directory: "results",
          namingPattern: "{workflow_name}_{timestamp}",
          overwrite: false,
          keepWorkDir: false,
        },
        container: {
          enabled: true,
          defaultImage: "ubuntu:22.04",
          registry: "docker.io",
          pullPolicy: "if-not-present",
          customRunOptions: [],
        },
        resources: {
          maxCpus: 4,
          maxMemory: "4.GB",
          maxTime: "PT30M",
          executor: "local",
        },
        errorHandling: {
          strategy: "terminate",
          maxRetries: 0,
          backoffStrategy: "exponential",
          continueOnError: false,
        },
        environment: {
          profile: "standard",
          customParams: {},
          environmentVariables: {},
        },
        cleanup: {
          onSuccess: false,
          onFailure: false,
          intermediateFiles: false,
          workDirectory: false,
        },
        validation: {
          requireContainer: false,
          allowMissingInputs: false,
          strictChannelTypes: false,
          enableTypeChecking: false,
        },
      };

      try {
        localStorage.setItem(
          "executionSettings",
          JSON.stringify(defaultSettings)
        );
      } catch (error) {
        console.error("Failed to initialize execution settings:", error);
      }
    }
  }, []);

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!openPanelNodeIds.includes(node.id)) {
        setOpenPanelNodeIds((prev) => [...prev, node.id]);
      }
      if (!activePanels.includes(node.id)) {
        setActivePanels((prev) => [...prev, node.id]);
      }

      bringPanelToFront(node.id);
      setActivePanelNodeId(node.id);

      // Recenter the panel if it's already open
      const isAlreadyOpen = activePanels.includes(node.id);
      if (isAlreadyOpen) {
        setRecenterRequest({ panelId: node.id, timestamp: Date.now() });
      }
    },
    [openPanelNodeIds, activePanels]
  );

  const onPanelClose = (panelId: string) => {
    setOpenPanelNodeIds((ids) => ids.filter((id) => id !== panelId));
    setActivePanelNodeId(null);
  };

  const bringPanelToFront = (panelId: string) => {
    setActivePanels((prev) => [...prev.filter((p) => p !== panelId), panelId]);
  };

  const handleSaveWorkflow = async () => {
    if (!workflowId) {
      showError("No workflow ID provided.");
      return;
    }
    if (workflowReadOnly) {
      await duplicateReadOnlyWorkflow();
      return;
    }
    setIsSaving(true);
    try {
      // Strip file content from nodes before saving to avoid payload too large errors
      const sanitizedNodes = nodes.map((node) => {
        const sanitizedData = { ...node.data };

        // Remove file content but keep metadata for file input nodes
        if (sanitizedData.files) {
          // Content is dropped: files live in the browser and are re-uploaded
          // after a reload (an empty content marks them as needing that).
          sanitizedData.files = sanitizedData.files.map((file: FileObject) => ({
            name: file.name,
            size: file.size,
            fileType: file.fileType,
            content: "",
          }));
        }

        // Remove other large content fields but keep user selections
        sanitizedData.fileContent = undefined;
        sanitizedData.processedContent = undefined;

        // Sanitize selectedFilterFiles - keep selection metadata but remove content
        if (sanitizedData.selectedFilterFiles) {
          sanitizedData.selectedFilterFiles =
            sanitizedData.selectedFilterFiles.map((file: FileObject) => ({
              name: file.name,
              size: file.size,
              fileType: file.fileType,
              content: "",
            }));
        }

        return {
          ...node,
          data: sanitizedData,
        };
      });

      // Get execution settings from current state instead of localStorage
      // This ensures we save the most up-to-date settings
      const executionSettingsToSave = executionSettings;

      await api.put(`/workflows/${workflowId}`, {
        name: workflowName,
        nodes: sanitizedNodes,
        edges,
        executionSettings: executionSettingsToSave, // Save current execution settings
      });
      setIsDirty(false);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000); // Show checkmark for 2 seconds
    } catch (err) {
      showError(
        `Failed to save workflow. ${getApiErrorMessage(err, "")}`.trim()
      );
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save 2 seconds after the last change. The timer restarts whenever
  // the graph changes; it calls the latest handleSaveWorkflow so it never
  // saves a stale snapshot.
  const handleSaveWorkflowRef = useLatestRef(handleSaveWorkflow);
  // biome-ignore lint/correctness/useExhaustiveDependencies: nodes and edges restart the debounce timer.
  useEffect(() => {
    const autoSaveTimer = setTimeout(() => {
      if (workflowContext.isDirty && !isSaving && workflowId && !workflowReadOnly) {
        handleSaveWorkflowRef.current();
      }
    }, 2000);

    return () => clearTimeout(autoSaveTimer);
  }, [
    workflowContext.isDirty,
    isSaving,
    workflowId,
    nodes,
    edges,
    workflowReadOnly,
    handleSaveWorkflowRef,
  ]);

  const handleExportProject = async () => {
    setIsExporting(true);
    try {
      const launch = buildPipelineLaunch(nodes, edges);
      if (launch) {
        const { buildPipelineProjectFiles, toProjectName, zipProject } =
          await import("../export/exportProject");
        const name = workflowName || "workflow";
        const fileName = `${toProjectName(name)}.zip`;
        downloadBlob(
          await zipProject(
            name,
            buildPipelineProjectFiles({
              workflowName: name,
              launch,
              nextflowVersion: executionSettings?.nextflow?.version,
            })
          ),
          fileName
        );
        showToast(
          `Exported ${fileName}. Unzip it and see README.md for how to run it.`,
          "success"
        );
        return;
      }
      const script =
        workflowSourceFormat === "nextflow" &&
        workflowRawSource &&
        nodes.length === 0
          ? workflowRawSource
          : generateNextflowScript(
              nodes,
              edges,
              workflowName || "workflow",
              "results",
              executionSettings?.output?.namingPattern ??
                "{workflow_name}_{timestamp}"
            );
      const { exportWorkflowProject } = await import(
        "../export/exportWorkflow"
      );
      const { fileName, blob } = await exportWorkflowProject({
        workflowName: workflowName || "workflow",
        script,
        nodes,
        nextflowVersion: executionSettings?.nextflow?.version,
      });
      downloadBlob(blob, fileName);
      showToast(
        `Exported ${fileName}. Unzip it and see README.md for how to run it.`,
        "success"
      );
    } catch (error: unknown) {
      showError(getApiErrorMessage(error, "Failed to export the project."));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadScript = () => {
    try {
      const launch = buildPipelineLaunch(nodes, edges);
      if (launch) {
        downloadBlob(
          new Blob([pipelineLaunchScript(launch)], {
            type: "text/plain;charset=utf-8",
          }),
          `${workflowName.replace(/\s+/g, "_") || "workflow"}.sh`
        );
        return;
      }
      if (
        workflowSourceFormat === "nextflow" &&
        workflowRawSource &&
        nodes.length === 0
      ) {
        const blob = new Blob([workflowRawSource], {
          type: "text/plain;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${workflowName.replace(/\s+/g, "_") || "workflow"}.nf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

      const script = generateNextflowScript(
        nodes,
        edges,
        workflowName || "workflow",
        executionSettings?.output?.directory || "results",
        executionSettings?.output?.namingPattern ??
          "{workflow_name}_{timestamp}"
      );
      const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${workflowName.replace(/\s+/g, "_") || "workflow"}.nf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      if (e instanceof Error) {
        showError(e.message); // Display cycle detection errors to the user
      } else {
        showError("An unknown error occurred during script generation.");
      }
    }
  };

  const handleRunWorkflow = async (settings: ExecutionSettings) => {
    setIsRunning(true);
    setExecutionResult(null);
    setExecutionSettings(settings);

    // Start execution status tracking
    executionStatus.startExecution();

    try {
      // Validate file inputs before execution
      const missingFiles = checkForMissingFiles();
      if (missingFiles.length > 0) {
        const errorMessage = `Cannot execute workflow: ${
          missingFiles.length
        } file${
          missingFiles.length === 1 ? "" : "s"
        } missing content.\n\nMissing files:\n${missingFiles
          .map((name) => `• ${name}`)
          .join("\n")}\n\nPlease upload ${
          missingFiles.length === 1 ? "this file" : "these files"
        } before running the workflow.`;

        throw new Error(errorMessage);
      }

      // A Pipeline node runs a whole nf-core pipeline instead of a script.
      const launch = buildPipelineLaunch(nodes, edges);

      // Files for the input directory: File Input uploads and samplesheets
      const workflowFiles: { [filename: string]: string } = {};
      for (const file of launch?.inputFiles ?? getWorkflowInputFiles(nodes)) {
        if (file.content) workflowFiles[file.name] = file.content;
      }

      // Generate the Nextflow script with execution settings
      const nextflowScript = launch
        ? ""
        : workflowSourceFormat === "nextflow" && workflowRawSource && nodes.length === 0
          ? workflowRawSource
          : generateNextflowScript(
              nodes,
              edges,
              workflowName || "workflow",
              settings.output.directory || "results",
              settings.output?.namingPattern ?? "{workflow_name}_{timestamp}"
            );

      if (!launch && (!nextflowScript || nextflowScript.trim() === "")) {
        throw new Error(
          "Generated Nextflow script is empty. Please add nodes to your workflow."
        );
      }

      // Flatten the enhanced execution settings to match backend interface
      const flatExecutionSettings = {
        useDocker: settings.container?.enabled ?? false,
        containerImage: settings.container?.defaultImage ?? "ubuntu:22.04",
        outputDirectory: settings.output.directory ?? "results",
        outputNaming:
          settings.output?.namingPattern ?? "{workflow_name}_{timestamp}",
        maxCpus: settings.resources?.maxCpus ?? 4,
        maxMemory: settings.resources?.maxMemory ?? "4 GB",
        // Minutes; 0 lets the backend apply its default.
        executionTimeout: isoDurationToMinutes(settings.resources?.maxTime),
        errorStrategy: settings.errorHandling?.strategy ?? "terminate",
        cleanupOnFailure: settings.cleanup?.onFailure ?? true,
        nextflowVersion: settings.nextflow?.version ?? "25.04.4",
      };

      // The output is read while the run goes: progress updates live, and
      // the run id (first line) makes Cancel work for long runs.
      const lineReader = createLineReader((line) => {
        const runId = parseRunId(line);
        if (runId) setCurrentExecutionId(runId);
        executionStatus.parseNextflowOutput(line);
      });

      // Execute the workflow with file content
      const response = await api.post(
        "/execute/execute",
        {
          ...(launch
            ? {
                pipeline: {
                  name: launch.name,
                  version: launch.version,
                  profiles: launch.profiles,
                  params: launch.params,
                },
              }
            : { nextflowScript }),
          workflowName: workflowName || "workflow",
          useDocker: settings.container?.enabled,
          containerImage: settings.container?.defaultImage,
          outputDirectory: settings.output.directory,
          executionSettings: flatExecutionSettings,
          fileContent: workflowFiles, // Send actual file content
        },
        {
          responseType: "text", // Handle as streaming text
          transformResponse: [(data) => data], // Don't parse as JSON
          // No client-side timeout: runs can take hours.
          timeout: 0,
          onDownloadProgress: (progressEvent) => {
            const request = progressEvent.event?.target as
              | XMLHttpRequest
              | undefined;
            if (typeof request?.responseText === "string") {
              lineReader.feed(request.responseText);
            }
          },
        }
      );

      // Handle streaming response
      if (typeof response.data === "string") {
        // Lines not seen while streaming (e.g. the last one)
        lineReader.flush(response.data);
        setCurrentExecutionId(null);

        const normalizedOutput = response.data.toLowerCase();
        const isCancelled = /^Execution cancelled$/m.test(response.data);
        const resourceProblem = findResourceProblem(response.data);
        const isExecutionFailure =
          !isCancelled &&
          (normalizedOutput.includes("nextflow execution failed with exit code") ||
            normalizedOutput.includes("execution error:") ||
            normalizedOutput.includes("failed to setup workflow execution") ||
            normalizedOutput.includes("error ~") ||
            resourceProblem !== null);

        // Remember the run on the Pipeline node, to show its reports.
        const runId = response.data.match(/^N-WAVE run: (\S+)$/m)?.[1];
        if (launch && runId) {
          workflowContext.updateNodeData(launch.nodeId, {
            pipelineLastRun: {
              id: runId,
              finishedAt: new Date().toISOString(),
              success: !isExecutionFailure,
            },
          });
        }

        if (isCancelled) {
          setExecutionResult({
            success: false,
            output: response.data,
            error: "Workflow cancelled",
          });
          return;
        }

        executionStatus.completeExecution(
          !isExecutionFailure,
          isExecutionFailure ? response.data : undefined
        );

        setExecutionResult({
          success: !isExecutionFailure,
          output: response.data,
          error: isExecutionFailure ? "Workflow execution failed" : undefined,
        });

        if (workflowContext.showToast) {
          if (resourceProblem) {
            workflowContext.showToast(
              `The run hit its resource limits: ${resourceProblem}`,
              "error"
            );
          } else if (isExecutionFailure) {
            workflowContext.showToast(
              "Workflow execution failed. Check the execution panel/log output for details.",
              "error"
            );
          } else {
            workflowContext.showToast(
              "Workflow executed successfully! Results have been written to ~/results. \nCheck the execution panel for details.",
              "success"
            );
          }
        }

        if (isExecutionFailure) {
          setExecutionError({
            message: resourceProblem
              ? `The run hit its resource limits. ${resourceProblem}`
              : "Workflow execution failed",
            output: response.data,
          });
          setShowErrorDialog(true);
        }
      } else {
        // Fallback for older JSON response format
        const parseOutputLines = (stdout: string, stderr = "") => {
          // Combine stdout and stderr for comprehensive parsing
          const allOutput = `${stdout}\n${stderr}`;
          const lines = allOutput.split("\n").filter((l) => l.trim());

          // Parse all lines to simulate the execution progression rapidly
          lines.forEach((line, index) => {
            // Add small delays to simulate real-time parsing for better UX
            setTimeout(() => {
              executionStatus.parseNextflowOutput(line);
            }, index * 50); // 50ms delay between each line for visual effect
          });

          // Complete execution after all lines are parsed
          setTimeout(() => {
            if (
              allOutput.includes("Nextflow execution completed successfully")
            ) {
              executionStatus.completeExecution(true);

              if (workflowContext.showToast) {
                workflowContext.showToast(
                  `Workflow executed successfully! Results saved to: ${resultsLocation}`,
                  "success"
                );
              }
            } else {
              console.warn(
                "⚠️ No completion pattern found, forcing completion"
              );
              executionStatus.completeExecution(true);

              if (workflowContext.showToast) {
                workflowContext.showToast(
                  `Workflow executed successfully! Results saved to: ${resultsLocation}`,
                  "success"
                );
              }
            }
          }, lines.length * 50 + 500); // Extra 500ms buffer
        };

        // Store execution ID immediately for cancellation
        if (response.data.executionId) {
          setCurrentExecutionId(response.data.executionId);
        }

        // Set initial execution result
        setExecutionResult({
          success: true,
          output: response.data.message || "Workflow execution started",
        });

        // Store results location for later use
        const resultsLocation = response.data.resultsLocation;

        // Parse the actual output returned from backend
        if (response.data) {
          const { stdout, stderr, success } = response.data;

          if (stdout) {
            parseOutputLines(stdout, stderr);
          } else if (success) {
            // If success but no stdout, complete immediately
            executionStatus.completeExecution(true);

            if (workflowContext.showToast) {
              workflowContext.showToast(
                `Workflow executed successfully! Results saved to: ${resultsLocation}`,
                "success"
              );
            }
          }
        } else {
          // Fallback for older response format
          console.warn(
            "⚠️ No structured response data, using fallback timeout"
          );

          const nodeCount = nodes.filter(
            (n) =>
              n.type === "process" ||
              n.type === "operator" ||
              n.type === "filter" ||
              n.type === "outputDisplay"
          ).length;

          const fallbackDuration = Math.min(
            Math.max(nodeCount * 5000, 30000),
            120000
          );

          setTimeout(() => {
            console.warn(
              "⏰ Fallback timeout reached - assuming workflow completed"
            );
            executionStatus.completeExecution(true);

            if (workflowContext.showToast) {
              workflowContext.showToast(
                `Workflow executed successfully! Results saved to: ${resultsLocation}`,
                "success"
              );
            }
          }, fallbackDuration);
        }
      }

      // Close the error dialog on successful execution
      setShowErrorDialog(false);
      setExecutionError(null);
    } catch (error: unknown) {
      console.error("Workflow execution failed:", error);
      const responseData = getResponseData(error);
      // The execute endpoint reports the specific problem in `error`.
      const errorMessage =
        typeof responseData?.error === "string" && responseData.error
          ? responseData.error
          : getApiErrorMessage(
              error,
              "Unknown error occurred during workflow execution"
            );

      const errorOutput = String(
        responseData?.stdout || responseData?.stderr || ""
      );

      setExecutionResult({
        success: false,
        output: errorOutput,
        error: errorMessage,
      });

      // Complete execution status tracking (failure)
      executionStatus.completeExecution(false, errorMessage);

      // Set error for the dialog
      setExecutionError({
        message: errorMessage,
        output: errorOutput,
        code:
          getResponseStatus(error) ??
          (error as { code?: string | number } | undefined)?.code,
      });

      setShowErrorDialog(true);
    } finally {
      setIsRunning(false);
      setCurrentExecutionId(null);
    }
  };

  const onNodeDragStart = () => setIsDragging(true);

  const onNodeDrag = (_: React.MouseEvent, node: Node) => {
    if (!node.width || !node.height || !node.positionAbsolute) return;

    const dropZone = document.getElementById("delete-drop-zone");
    if (!dropZone) return;

    const dropZoneRect = dropZone.getBoundingClientRect();

    const topLeft = screenToFlowPosition({
      x: dropZoneRect.left,
      y: dropZoneRect.top,
    });
    const bottomRight = screenToFlowPosition({
      x: dropZoneRect.right,
      y: dropZoneRect.bottom,
    });

    const isHovering =
      node.positionAbsolute.x < bottomRight.x &&
      node.positionAbsolute.x + node.width > topLeft.x &&
      node.positionAbsolute.y < bottomRight.y &&
      node.positionAbsolute.y + node.height > topLeft.y;

    setIsHoveringDropZone(isHovering);
  };

  const onNodeDragStop = (_: React.MouseEvent, node: Node) => {
    setIsDragging(false);
    if (isHoveringDropZone) {
      if (workflowReadOnly) {
        void duplicateReadOnlyWorkflow();
        setIsHoveringDropZone(false);
        return;
      }
      setNodes((nds) => nds.filter((n) => n.id !== node.id));
      setEdges((eds) =>
        eds.filter((e) => e.source !== node.id && e.target !== node.id)
      );
    }
    setIsHoveringDropZone(false);
  };

  const handleDeleteNode = (node: Node<NodeData> | null) => {
    if (workflowReadOnly) {
      void duplicateReadOnlyWorkflow();
      return;
    }
    if (node) {
      setNodeToDelete(node);
    }
  };

  const onConfirmDelete = () => {
    if (nodeToDelete) {
      if (workflowReadOnly) {
        void duplicateReadOnlyWorkflow();
        setNodeToDelete(null);
        return;
      }
      setNodes((nds) => nds.filter((n) => n.id !== nodeToDelete.id));
      setEdges((eds) =>
        eds.filter(
          (e) => e.source !== nodeToDelete.id && e.target !== nodeToDelete.id
        )
      );
      setNodeToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setNodeToDelete(null);
  };

  // Helper function to check for missing files
  const checkForMissingFiles = (): string[] => {
    const fileInputNodes = nodes.filter((node) => node.type === "fileInput");
    const missingFiles: string[] = [];

    for (const node of fileInputNodes) {
      if (node.data.files && Array.isArray(node.data.files)) {
        for (const file of node.data.files) {
          if (!file.content || file.content.trim() === "") {
            missingFiles.push(file.name || file.originalName || "unknown_file");
          }
        }
      }
    }

    return missingFiles;
  };

  // Check if workflow can be executed (no missing files)
  const canExecuteWorkflow = checkForMissingFiles().length === 0;

  const handleRetryExecution = async () => {
    if (!executionSettings) {
      throw new Error("No execution settings available for retry");
    }

    // Call handleRunWorkflow for retry
    await handleRunWorkflow(executionSettings);
  };

  const handleCloseErrorDialog = () => {
    setShowErrorDialog(false);
    setExecutionError(null);
  };

  const onPanelPositionChange = useCallback(
    (panelId: string, x: number, y: number) => {
      setPanelStates((prev) => ({
        ...prev,
        [panelId]: {
          ...prev[panelId],
          x: prev[panelId].x + x,
          y: prev[panelId].y + y,
        },
      }));
    },
    []
  );

  const onPanelResize = useCallback((panelId: string, x: number, y: number) => {
    setPanelStates((prev) => ({
      ...prev,
      [panelId]: {
        ...prev[panelId],
        width: prev[panelId].width + x,
        height: prev[panelId].height + y,
      },
    }));
  }, []);

  const handleExecutionSettingsChange = useCallback(
    (newSettings: ExecutionSettings) => {
      if (workflowReadOnly) {
        void duplicateReadOnlyWorkflow();
        return;
      }

      setExecutionSettings(newSettings);

      // Save to localStorage immediately
      try {
        localStorage.setItem("executionSettings", JSON.stringify(newSettings));
      } catch (error) {
        console.error(
          "Failed to save execution settings to localStorage:",
          error
        );
      }

      // Mark workflow as dirty to trigger auto-save
      setIsDirty(true);
    },
    [setIsDirty, workflowReadOnly, duplicateReadOnlyWorkflow]
  );

  const renderPanels = () => {
    const nodesMap = new Map(nodes.map((n) => [n.id, n]));
    const openNodes = openPanelNodeIds
      .map((id) => nodesMap.get(id))
      .filter((n): n is Node<NodeData> => !!n);

    return openNodes.map((node) => {
      const style = { zIndex: (activePanels.indexOf(node.id) + 1) * 10 };
      const recenterTrigger =
        recenterRequest?.panelId === node.id
          ? recenterRequest.timestamp
          : undefined;

      if (node.type === "outputDisplay" || node.type === "documentation") {
        return (
          <FloatingPanel
            key={node.id}
            panelId={node.id}
            title={node.data.label || "Panel"}
            isOpen={activePanels.includes(node.id)}
            onClose={() => onPanelClose(node.id)}
            onDelete={() => handleDeleteNode(node)}
            onMouseEnter={() => setActivePanelNodeId(node.id)}
            onMouseLeave={() => setActivePanelNodeId(null)}
            onFocus={() => bringPanelToFront(node.id)}
            style={style}
            recenterTrigger={recenterTrigger}
            onPositionChange={(dx, dy) =>
              onPanelPositionChange(node.id, dx, dy)
            }
            onResize={(dx, dy) => onPanelResize(node.id, dx, dy)}
          >
            {node.type === "outputDisplay" ? (
              <OutputDisplayPanelContent
                node={node}
                onNodeDataChange={handleUpdateNodeData}
              />
            ) : null}
          </FloatingPanel>
        );
      }
        return (
          <PropertiesPanel
            key={node.id}
            node={node}
            onClose={() => onPanelClose(node.id)}
            onSave={handleUpdateNodeData}
            onDelete={() => {
              handleDeleteNode(node);
              onPanelClose(node.id);
            }}
            onMouseEnter={() => setActivePanelNodeId(node.id)}
            onMouseLeave={() => setActivePanelNodeId(null)}
            onFocus={() => bringPanelToFront(node.id)}
            style={style}
            recenterTrigger={recenterTrigger}
            onConvertToCustom={handleConvertToCustomNode}
            onEditCustomNode={handleEditCustomNode}
          />
        );
    });
  };

  if (loadError) {
    return (
      <ErrorFallback
        fullPage
        title={loadError.title}
        description={loadError.detail}
        onRetry={() => {
          setLoadError(null);
          setIsLoading(true);
          void fetchWorkflow();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-canvas-background text-text">
      <Header
        onProcessSelect={handleProcessSelect}
        onCustomNodeSaved={applyCustomNodeDefinitionToPlacedNodes}
        onCustomNodeDeleteRequested={(customNode) => {
          setCustomNodeDeleteError(null);
          setCustomNodeDeleteCandidate(customNode);
        }}
      />
      <div className="flex-grow relative">
        {isLoading && (
          <div className="absolute inset-0 bg-background bg-opacity-80 flex items-center justify-center z-50">
            <div className="text-text-light text-xl flex items-center gap-2">
              <Loader className="animate-spin text-nextflow-green" />
              <span className="text-nextflow-green">Loading Workflow...</span>
            </div>
          </div>
        )}
        <ErrorBoundary
          title="The canvas ran into a problem"
          description="Your last saved version of this workflow is safe. Try again to re-render the canvas, or reload the page."
        >
          <Canvas
            nodes={memoizedNodes}
            edges={memoizedEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onNodeDoubleClick={onNodeDoubleClick}
            isValidConnection={isValidConnection}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
          />
        </ErrorBoundary>
        {isTutorialActive && tutorialStepIndex !== null && (
          <TutorialCallout
            text={tutorialSteps[tutorialStepIndex].text}
            targetSelector={tutorialSteps[tutorialStepIndex].targetSelector}
            placement={tutorialSteps[tutorialStepIndex].placement}
            canGoBack={tutorialStepIndex > 0}
            canGoForward={tutorialStepIndex < tutorialSteps.length - 1}
            skipLabel={
              tutorialStepIndex === tutorialSteps.length - 1
                ? "Finish Tutorial"
                : "Skip Tutorial"
            }
            onBack={goToPreviousTutorialStep}
            onForward={handleTutorialForward}
            onSkip={() => {
              void finishTutorial();
            }}
          />
        )}
        <DeleteDropZone
          isDragging={isDragging}
          isHovering={isHoveringDropZone}
        />
        <ErrorBoundary
          title="A properties panel ran into a problem"
          description="Your workflow on the canvas is unaffected. Try again, or reload the page."
          className="absolute bottom-4 right-4 z-50 text-text"
        >
          {renderPanels()}
        </ErrorBoundary>
      </div>
      {workflowImportWarnings.length > 0 && (
        <div className="border-t border-yellow-700/40 bg-yellow-100/90 px-4 py-3 text-sm text-yellow-900">
          {workflowImportWarnings.join(" ")}
        </div>
      )}

      <BottomBar
        workflowName={workflowName}
        onWorkflowNameChange={handleWorkflowNameChange}
        onSave={handleSaveWorkflow}
        onDownload={handleDownloadScript}
        onExportProject={handleExportProject}
        isExporting={isExporting}
        onRun={handleRunWorkflow}
        isSaved={isSaved}
        isSaving={isSaving}
        isRunning={isRunning}
        canExecute={canExecuteWorkflow}
        isLoading={isLoading}
        executionSettings={executionSettings as ExecutionSettings}
        onExecutionSettingsChange={handleExecutionSettingsChange}
      />
      {nodeToDelete && (
        <ConfirmDialog
          isOpen={!!nodeToDelete}
          title="Delete Node"
          message={`Are you sure you want to delete the "${
            nodeToDelete.data.label || nodeToDelete.id
          }" node?`}
          onConfirm={onConfirmDelete}
          onClose={handleCancelDelete}
        />
      )}
      {customNodeDeleteCandidate && (
        <ConfirmDialog
          isOpen={!!customNodeDeleteCandidate}
          title="Delete Custom Node"
          message={
            customNodeDeleteError ||
            `Delete "${customNodeDeleteCandidate.label}" from N-WAVE? This removes the node from the node library and purges all placed instances from saved workflows.`
          }
          confirmText="Delete"
          onConfirm={handleConfirmCustomNodeDelete}
          onClose={() => {
            setCustomNodeDeleteCandidate(null);
            setCustomNodeDeleteError(null);
          }}
        />
      )}
      <CustomNodeModal
        isOpen={editingCustomNode !== null}
        node={editingCustomNode}
        onClose={() => setEditingCustomNode(null)}
        onSaved={(savedNode) => {
          applyCustomNodeDefinitionToPlacedNodes(savedNode);
          refreshCustomNodes().catch(() => 0);
        }}
      />
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={closeToast} />
      )}
      {showErrorDialog && executionError && (
        <WorkflowExecutionErrorNotification
          isVisible={showErrorDialog}
          onClose={handleCloseErrorDialog}
          onRetry={handleRetryExecution}
          error={executionError}
        />
      )}

      {/* Execution Status Panel */}
      <ExecutionStatusPanel
        status={executionStatus.status}
        nodes={memoizedNodes}
        onCancel={executionStatus.cancelExecution}
        canCancel={Boolean(currentExecutionId)}
        onClose={executionStatus.hideStatus}
        isVisible={executionStatus.isVisible}
      />
    </div>
  );
};

const WorkflowPage: React.FC = () => (
  <ReactFlowProvider>
    <WorkflowProvider>
      <WorkflowPageContent />
    </WorkflowProvider>
  </ReactFlowProvider>
);

export default WorkflowPage;
