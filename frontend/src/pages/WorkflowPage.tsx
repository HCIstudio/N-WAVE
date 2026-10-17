import { Loader } from "lucide-react";
import type React from "react";
import { useCallback, useContext, useMemo, useState } from "react";
import { useParams } from "react-router";
import { type Node, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { isDemoMode } from "../api";
import { refreshCustomNodes } from "../api/customNodes";
import BottomBar from "../components/canvas/BottomBar";
import Canvas from "../components/canvas/Canvas";
import DeleteDropZone from "../components/canvas/DeleteDropZone";
import {
  ConfirmDialog,
  ErrorBoundary,
  ErrorFallback,
  Toast,
  WorkflowExecutionErrorNotification,
} from "../components/common";
import CustomNodeModal from "../components/common/forms/CustomNodeModal";
import ExecutionStatusPanel from "../components/common/workflow/ExecutionStatusPanel";
import Header from "../components/layout/Header";
import type { NodeData } from "../components/nodes/BaseNode";
import { WorkflowContext, WorkflowProvider } from "../context/WorkflowContext";
import type { NextflowProcess } from "../data/types";
import { RunTasksContext } from "../execution/RunTasksContext";
import type { ExecutionSettings } from "../types/execution";
import { getApiErrorMessage } from "../utils/errors";
import { findFreePosition } from "../utils/nodePlacement";
import CanvasNotices from "./workflow/CanvasNotices";
import NodePanels from "./workflow/NodePanels";
import { findMissingFileContents } from "./workflow/runRequest";
import { useCustomNodeActions } from "./workflow/useCustomNodeActions";
import { useEditGuards } from "./workflow/useEditGuards";
import { useLibraryNodes } from "./workflow/useLibraryNodes";
import { useNodeDeletion } from "./workflow/useNodeDeletion";
import { useNodePanels } from "./workflow/useNodePanels";
import { useRunTasks } from "./workflow/useRunTasks";
import { useWorkflowDocument } from "./workflow/useWorkflowDocument";
import { useWorkflowRun } from "./workflow/useWorkflowRun";
import { useWorkflowTutorial, WorkflowTutorial } from "./workflow/useWorkflowTutorial";
import {
  downloadScript,
  exportProject,
  type WorkflowSource,
} from "./workflow/workflowExport";

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
    isDirty,
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
  const { id: workflowId } = useParams<{ id: string }>();
  const { screenToFlowPosition, getNodes } = useReactFlow();

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
    duplicateReadOnlyWorkflow,
    executionSettings,
    rename,
    changeExecutionSettings,
  } = workflow;
  const tutorial = useWorkflowTutorial({
    workflowId,
    readOnly,
    duplicateReadOnlyWorkflow,
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
    duplicateReadOnlyWorkflow,
    showToast,
    setIsDirty,
    onNodesChange,
    onEdgesChange,
    onConnect,
  });
  const { blockedByRun, canEdit, ensureEditable } = guards;
  const { onAddNode } = tutorial;
  const panels = useNodePanels();
  const deletion = useNodeDeletion({
    readOnly,
    duplicateReadOnlyWorkflow,
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
  const { missingNfCoreComponents, reloadInstalledNfCore } =
    useLibraryNodes(nodes);
  const runTasks = useRunTasks(isDemoMode ? null : run.lastRunId, isRunning, nodes);
  const [isExporting, setIsExporting] = useState(false);

  const handleProcessSelect = useCallback(
    (process: NextflowProcess) => {
      if (blockedByRun()) return;
      // The tutorial's add-node step may continue in a copy instead.
      if (onAddNode()) return;
      if (readOnly) {
        void duplicateReadOnlyWorkflow();
        return;
      }
      const desired = screenToFlowPosition({
        x: window.innerWidth / 2 - 150, // Adjust for panel width
        y: window.innerHeight / 3,
      });
      const newNode: Node<NodeData> = {
        id: `node-${+new Date()}`,
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
      duplicateReadOnlyWorkflow,
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
  // under the pointer is highlighted, and a run or a read-only workflow
  // stops editing.
  const canvasNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: { ...node.data, isHighlight: node.id === panels.highlightedId },
        selectable: true,
        draggable: !readOnly && !isRunning,
        connectable: !isRunning,
        deletable: !isRunning,
        // React Flow marks draggable nodes "nopan"; without it, the canvas's
        // double-click zoom swallows the double-click that opens a panel.
        className: readOnly
          ? [node.className, "nopan"].filter(Boolean).join(" ")
          : node.className,
      })),
    [nodes, panels.highlightedId, readOnly, isRunning]
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
          canExecute={findMissingFileContents(nodes).length === 0}
          isLoading={workflow.isLoading}
          executionSettings={executionSettings}
          onExecutionSettingsChange={handleExecutionSettingsChange}
          onShowRuns={run.openPanel}
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
