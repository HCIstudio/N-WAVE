import { Loader } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { type Node, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { isDemoMode } from "../api";
import { refreshCustomNodes } from "../api/customNodes";
import BottomBar from "../components/canvas/BottomBar";
import Canvas from "../components/canvas/Canvas";
import DeleteDropZone from "../components/canvas/DeleteDropZone";
import WorkflowCheckButton from "../components/canvas/WorkflowCheckButton";
import {
  ConfirmDialog,
  ErrorBoundary,
  ErrorFallback,
  Toast,
  WorkflowExecutionErrorNotification,
} from "../components/common";
import CustomNodeModal from "../components/common/forms/CustomNodeModal";
import ShortcutsDialog from "../components/canvas/ShortcutsDialog";
import ExecutionStatusPanel from "../components/common/workflow/ExecutionStatusPanel";
import Header from "../components/layout/Header";
import type { NodeData } from "../components/nodes/BaseNode";
import { useWorkflowContext, WorkflowProvider } from "../context/WorkflowContext";
import type { NextflowProcess } from "../data/types";
import { explainFailure } from "../execution/failureExplanations";
import { nodeIdForProcess } from "../execution/nodeRuns";
import { ConnectionHintsContext } from "../execution/ConnectionHintsContext";
import { NodeProblemsContext } from "../execution/NodeProblemsContext";
import { connectionHints } from "../registry/portTypes";
import { RunTasksContext } from "../execution/RunTasksContext";
import type { ExecutionSettings } from "../types/execution";
import { getApiErrorMessage } from "../utils/errors";
import { findFreePosition } from "../utils/nodePlacement";
import CanvasNotices from "./workflow/CanvasNotices";
import CopyPromptDialog from "./workflow/CopyPromptDialog";
import NodePanels from "./workflow/NodePanels";
import { useCanvasHistory } from "./workflow/useCanvasHistory";
import { useCanvasShortcuts } from "./workflow/useCanvasShortcuts";
import { useCustomNodeActions } from "./workflow/useCustomNodeActions";
import { useEditGuards } from "./workflow/useEditGuards";
import { useLibraryNodes } from "./workflow/useLibraryNodes";
import { useNodeDeletion } from "./workflow/useNodeDeletion";
import { useNodePanels } from "./workflow/useNodePanels";
import { useRunTasks } from "./workflow/useRunTasks";
import {
  type CopiedFromState,
  useWorkflowDocument,
} from "./workflow/useWorkflowDocument";
import { useWorkflowCheck } from "./workflow/useWorkflowCheck";
import { useWorkflowRun } from "./workflow/useWorkflowRun";
import { useWorkflowTutorial, WorkflowTutorial } from "./workflow/useWorkflowTutorial";
import {
  downloadScript,
  exportProject,
  type WorkflowSource,
} from "./workflow/workflowExport";

const WorkflowPageContent: React.FC = () => {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodes,
    setEdges,
    updateNodeData,
    isDirty,
    setIsDirty,
    isValidConnection,
    onConnectStart,
    onConnectEnd,
    toast,
    closeToast,
    showToast,
  } = useWorkflowContext();
  // Errors from user actions (save, duplicate, script generation) are shown as
  // toasts so the editor stays usable.
  const showError = useCallback(
    (message: string) => showToast(message, "error"),
    [showToast]
  );
  const { id: workflowId } = useParams<{ id: string }>();
  const { screenToFlowPosition, getNodes, fitView } = useReactFlow();

  const workflow = useWorkflowDocument({
    workflowId,
    nodes,
    edges,
    setNodes,
    setEdges,
    isDirty,
    setIsDirty,
    showError,
  });
  const {
    readOnly,
    requestCopy,
    workflowName,
    executionSettings,
    rename,
    changeExecutionSettings,
  } = workflow;
  // A fresh copy of an example says so once it's open.
  const location = useLocation();
  const navigate = useNavigate();
  const copied = location.state as CopiedFromState | null;
  useEffect(() => {
    if (!copied?.copiedFrom) return;
    showToast(
      `You're editing “${copied.copyName}”, your own copy. The example “${copied.copiedFrom}” is unchanged.`,
      "success",
    );
    navigate(location.pathname, { replace: true, state: null });
  }, [copied, showToast, navigate, location.pathname]);
  const tutorial = useWorkflowTutorial({
    workflowId,
    readOnly,
    requestCopy,
    showError,
  });
  const run = useWorkflowRun({
    nodes,
    edges,
    workflowId,
    workflowName: workflow.workflowName,
    rawSource: workflow.rawSource,
    sourceFormat: workflow.sourceFormat,
    setExecutionSettings: workflow.setExecutionSettings,
    updateNodeData,
    showToast,
  });
  const { isRunning } = run;
  const guards = useEditGuards({
    isRunning,
    readOnly,
    requestCopy,
    showToast,
    setIsDirty,
    onNodesChange,
    onEdgesChange,
    onConnect,
  });
  const { blockedByRun, canEdit, ensureEditable } = guards;
  const history = useCanvasHistory({
    nodes,
    edges,
    setNodes,
    setEdges,
    setIsDirty,
    enabled: !workflow.isLoading && !readOnly && !isRunning,
    documentKey: workflowId,
    isLoading: workflow.isLoading,
  });
  const { missingNfCoreComponents, reloadInstalledNfCore } =
    useLibraryNodes(nodes);
  const check = useWorkflowCheck({
    nodes,
    edges,
    settings: executionSettings,
    missingNfCoreComponents,
  });
  // Connections whose ports don't fit; stable while a drag moves nodes.
  const hintsKey = useMemo(
    () => JSON.stringify(connectionHints(nodes, edges)),
    [nodes, edges]
  );
  const edgeHints = useMemo(() => JSON.parse(hintsKey), [hintsKey]);
  const nodeLabels = useMemo(
    () =>
      Object.fromEntries(
        nodes.map((node) => [node.id, String(node.data.label || node.type || node.id)]),
      ),
    [nodes]
  );
  const showNode = useCallback(
    (nodeId: string) => {
      setNodes((current) =>
        current.map((node) => ({ ...node, selected: node.id === nodeId }))
      );
      void fitView({ nodes: [{ id: nodeId }], duration: 300, maxZoom: 1.2 });
    },
    [setNodes, fitView]
  );
  const [showShortcuts, setShowShortcuts] = useState(false);
  useCanvasShortcuts({
    nodes,
    edges,
    setNodes,
    setEdges,
    setIsDirty,
    enabled: !workflow.isLoading,
    readOnly,
    blockedByRun,
    showToast,
    onSave: workflow.save,
    onRun: () => {
      if (isRunning) return;
      if (check.blockedReason) {
        showToast(check.blockedReason, "info");
        return;
      }
      void run.run(executionSettings);
    },
    onFitView: () => void fitView({ duration: 200 }),
    onShowShortcuts: () => setShowShortcuts(true),
  });
  const { onAddNode } = tutorial;
  const panels = useNodePanels();
  const deletion = useNodeDeletion({
    readOnly,
    requestCopy,
    canEdit,
    setNodes,
    setEdges,
  });
  const customNodes = useCustomNodeActions({
    nodes,
    edges,
    setNodes,
    setEdges,
    setIsDirty,
    ensureEditable,
    showToast,
    showError,
  });
  const runTasks = useRunTasks(isDemoMode ? null : run.lastRunId, isRunning, nodes);
  const [isExporting, setIsExporting] = useState(false);

  // Why the last run failed, and the step it failed in, if the log says.
  const failure = useMemo(
    () => (!isRunning && run.output ? explainFailure(run.output) : null),
    [isRunning, run.output]
  );
  const failedNodeId = failure?.process
    ? nodeIdForProcess(
        failure.process,
        nodes,
        nodes.find((node) => node.type === "pipeline")?.id
      )
    : undefined;
  const failedStepLabel = failedNodeId ? nodeLabels[failedNodeId] : undefined;
  const showFailedStep = failedNodeId ? () => showNode(failedNodeId) : undefined;

  const handleProcessSelect = useCallback(
    (process: NextflowProcess) => {
      if (blockedByRun()) return;
      // The tutorial's add-node step may continue in a copy instead.
      if (onAddNode()) return;
      if (readOnly) {
        void requestCopy();
        return;
      }
      const desired = screenToFlowPosition({
        x: window.innerWidth / 2 - 150, // Adjust for panel width
        y: window.innerHeight / 3,
      });
      const newNode: Node<NodeData> = {
        id: `node-${Date.now()}`,
        type: process.type,
        // Next to what's on the canvas, never on top of another node.
        position: findFreePosition(desired, getNodes()),
        data: {
          label: process.label,
          icon: process.icon,
          ...process.initialData,
        },
      };
      setNodes((current) => current.concat(newNode));
      setIsDirty(true);
    },
    [
      blockedByRun,
      onAddNode,
      readOnly,
      requestCopy,
      screenToFlowPosition,
      getNodes,
      setNodes,
      setIsDirty,
    ]
  );

  const handleUpdateNodeData = useCallback(
    async (nodeId: string, data: Partial<NodeData>) => {
      const current = nodes.find((node) => node.id === nodeId);
      const isNoop =
        current &&
        Object.entries(data).every(([key, value]) => current.data[key] === value);
      if (isNoop) return;
      if (!(await ensureEditable())) return;
      updateNodeData(nodeId, data);
    },
    [nodes, ensureEditable, updateNodeData]
  );

  const handleWorkflowNameChange = useCallback(
    (name: string) => {
      if (canEdit()) rename(name);
    },
    [canEdit, rename]
  );

  const handleExecutionSettingsChange = useCallback(
    (settings: ExecutionSettings) => {
      if (canEdit()) changeExecutionSettings(settings);
    },
    [canEdit, changeExecutionSettings]
  );

  const workflowSource: WorkflowSource = {
    nodes,
    edges,
    workflowName: workflow.workflowName,
    settings: executionSettings,
    rawSource: workflow.rawSource,
    sourceFormat: workflow.sourceFormat,
  };

  const handleDownloadScript = () => {
    try {
      downloadScript(workflowSource);
    } catch (error) {
      // e.g. a cycle in the workflow
      showError(
        error instanceof Error
          ? error.message
          : "An unknown error occurred during script generation."
      );
    }
  };

  const handleExportProject = async () => {
    setIsExporting(true);
    try {
      const fileName = await exportProject(workflowSource);
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

  // Interaction flags on the nodes the canvas shows: the node of the panel
  // under the pointer is highlighted, and a run stops editing. Nodes of a
  // read-only workflow stay draggable: dropping one opens an editable copy.
  const canvasNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: { ...node.data, isHighlight: node.id === panels.highlightedId },
        selectable: true,
        draggable: !isRunning,
        connectable: !isRunning,
        deletable: !isRunning,
      })),
    [nodes, panels.highlightedId, isRunning]
  );

  if (workflow.loadError) {
    return (
      <ErrorFallback
        fullPage
        title={workflow.loadError.title}
        description={workflow.loadError.detail}
        onRetry={workflow.retryLoad}
      />
    );
  }

  return (
    <RunTasksContext.Provider value={runTasks}>
      <NodeProblemsContext.Provider value={check.nodeProblems}>
      <ConnectionHintsContext.Provider value={edgeHints}>
      <div className="flex flex-col h-screen w-screen bg-canvas-background text-text">
        <Header
          onProcessSelect={handleProcessSelect}
          onCustomNodeSaved={customNodes.applyDefinition}
          onCustomNodeDeleteRequested={customNodes.requestDelete}
        />
        <div className="flex-grow relative">
          {workflow.isLoading && (
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
              nodes={canvasNodes}
              edges={edges}
              onNodesChange={guards.handleNodesChange}
              onEdgesChange={guards.handleEdgesChange}
              onConnect={guards.handleConnect}
              onNodeDragStart={deletion.onNodeDragStart}
              onNodeDrag={deletion.onNodeDrag}
              onNodeDragStop={deletion.onNodeDragStop}
              onNodeDoubleClick={(_, node) => panels.open(node.id)}
              isValidConnection={isValidConnection}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              history={history}
              onShowShortcuts={() => setShowShortcuts(true)}
            />
          </ErrorBoundary>
          <WorkflowTutorial tutorial={tutorial} />
          <CanvasNotices
            isRunning={isRunning}
            missingNfCoreComponents={missingNfCoreComponents}
            onNfCoreInstalled={reloadInstalledNfCore}
            importWarnings={workflow.importWarnings}
          />
          <DeleteDropZone
            isDragging={deletion.isDragging}
            isHovering={deletion.isHoveringDropZone}
          />
          <ErrorBoundary
            title="A properties panel ran into a problem"
            description="Your workflow on the canvas is unaffected. Try again, or reload the page."
            className="absolute bottom-4 right-4 z-50 text-text"
          >
            <NodePanels
              nodes={nodes}
              panels={panels}
              locked={isRunning}
              onNodeDataChange={handleUpdateNodeData}
              onDeleteNode={deletion.requestDelete}
              onConvertToCustom={customNodes.convert}
              onEditCustomNode={customNodes.edit}
            />
          </ErrorBoundary>
        </div>

        <BottomBar
          workflowName={workflow.workflowName}
          onWorkflowNameChange={handleWorkflowNameChange}
          onSave={workflow.save}
          onDownload={handleDownloadScript}
          onExportProject={handleExportProject}
          isExporting={isExporting}
          onRun={run.run}
          isSaved={workflow.isSaved}
          isSaving={workflow.isSaving}
          isRunning={isRunning}
          runBlockedReason={check.blockedReason}
          checkControl={
            <WorkflowCheckButton
              problems={check.problems}
              nodeLabels={nodeLabels}
              onShowNode={showNode}
              onRecheck={isDemoMode ? undefined : () => void check.recheck()}
              isChecking={check.isChecking}
            />
          }
          isLoading={workflow.isLoading}
          executionSettings={executionSettings}
          onExecutionSettingsChange={handleExecutionSettingsChange}
          onShowRuns={run.openPanel}
        />
        <CopyPromptDialog
          isOpen={workflow.isCopyPromptOpen}
          workflowName={workflowName}
          onCopy={() => void workflow.confirmCopy()}
          onJustLook={workflow.declineCopy}
        />
        <ShortcutsDialog
          isOpen={showShortcuts}
          onClose={() => setShowShortcuts(false)}
        />
        {deletion.nodeToDelete && (
          <ConfirmDialog
            isOpen
            title="Delete Node"
            message={`Are you sure you want to delete the "${
              deletion.nodeToDelete.data.label || deletion.nodeToDelete.id
            }" node?`}
            onConfirm={deletion.confirmDelete}
            onClose={deletion.cancelDelete}
          />
        )}
        {customNodes.deleteCandidate && (
          <ConfirmDialog
            isOpen
            title="Delete Custom Node"
            message={
              customNodes.deleteError ||
              `Delete "${customNodes.deleteCandidate.label}" from N-WAVE? This removes the node from the node library and purges all placed instances from saved workflows.`
            }
            confirmText="Delete"
            onConfirm={customNodes.confirmDelete}
            onClose={customNodes.cancelDelete}
          />
        )}
        <CustomNodeModal
          isOpen={customNodes.editing !== null}
          node={customNodes.editing}
          onClose={customNodes.closeEditor}
          onSaved={(savedNode) => {
            customNodes.applyDefinition(savedNode);
            refreshCustomNodes().catch(() => 0);
          }}
        />
        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={closeToast} />
        )}
        {run.error && (
          <WorkflowExecutionErrorNotification
            isVisible
            onClose={run.dismissError}
            onRetry={() => run.run(executionSettings)}
            onShowLog={run.showLog}
            error={run.error}
            explanation={failure}
            stepLabel={failedStepLabel}
            onShowStep={showFailedStep}
          />
        )}
        <ExecutionStatusPanel
          status={run.executionStatus.status}
          nodes={canvasNodes}
          onCancel={run.executionStatus.cancelExecution}
          canCancel={run.canCancel}
          onClose={run.executionStatus.hideStatus}
          isVisible={run.executionStatus.isVisible}
          runId={isDemoMode ? null : run.lastRunId}
          output={run.output}
          workflowId={workflowId}
          tab={run.panelTab}
          onTabChange={run.setPanelTab}
          minimized={run.panelMinimized}
          onMinimizedChange={run.setPanelMinimized}
          failure={failure}
          failedStepLabel={failedStepLabel}
          onShowFailedStep={showFailedStep}
          // In the order their first task started.
          steps={Object.entries(runTasks.nodeRuns).map(([id, nodeRun]) => ({
            id,
            label: nodes.find((node) => node.id === id)?.data.label || id,
            status: nodeRun.status,
            done: nodeRun.done,
            total: nodeRun.total,
          }))}
        />
      </div>
      </ConnectionHintsContext.Provider>
      </NodeProblemsContext.Provider>
    </RunTasksContext.Provider>
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
