import { Loader } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { type Node, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import api, { isDemoMode } from "../api";
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
import SaveConflictDialog from "./workflow/SaveConflictDialog";
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
import { useRunResume } from "./workflow/useRunResume";
import { useCanvasActivity } from "./workflow/useCanvasActivity";
import { logActivity } from "../activity/activityLog";
import NestedView from "../components/canvas/NestedView";
import AnalysisPanel from "../components/canvas/AnalysisPanel";
import AnalyseButton from "../components/canvas/AnalyseButton";
import { useWorkflowAnalysis } from "../analysis/useWorkflowAnalysis";
import { useStepConditions } from "../analysis/useStepConditions";
import { NodeConditionsContext } from "../execution/NodeConditionsContext";
import { useCanvasView } from "../canvas/useCanvasView";
import CanvasViewSwitch from "../components/canvas/CanvasViewSwitch";
import NeedsInstall, { demoUnavailable, NEEDS_INSTALL } from "../components/common/ui/NeedsInstall";
import GraphView, { type GraphUnavailable } from "../components/graphView/GraphView";
import GroupDialog from "../components/canvas/GroupDialog";
import { GroupActionsContext } from "../components/canvas/GroupNodes";
import { useGroups } from "./workflow/useGroups";
import { buildSubworkflowCopy, CopySubworkflowContext } from "../workflows/copySubworkflowWorkflow";
import { nestedEntryOf } from "../workflows/nested/nestedEntry";
import { NestedViewContext } from "../workflows/nested/NestedViewContext";
import { getProcessNameForNode } from "../generators/core/generateNextflowScript";
import { runStages } from "../execution/runStages";
import { applyRunDefaults } from "../settings/effectiveSettings";
import { useRunDefaults } from "../settings/useRunDefaults";
import { useFeature } from "../settings/useFeatures";
import RunCacheSettings from "../components/common/workflow/RunCacheSettings";
import { useWorkflowTutorial, WorkflowTutorial } from "./workflow/useWorkflowTutorial";
import type { WorkflowSource } from "./workflow/workflowExport";
import { useWorkflowExports } from "./workflow/useWorkflowExports";

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
  const showNotice = useCallback(
    (message: string) => showToast(message, "info"),
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
    showNotice,
  });
  const {
    readOnly,
    requestCopy,
    workflowName,
    executionSettings,
    rename,
    changeExecutionSettings,
  } = workflow;
  // What runs and exports use: the workflow's settings with the defaults of
  // the Settings page filled in.
  const runDefaults = useRunDefaults();
  // Without run profiles (Global Settings → Features), runs use this computer.
  const runProfilesOn = useFeature("runProfiles");
  const runSettings = useMemo(
    () => applyRunDefaults(executionSettings, runDefaults.defaults, runProfilesOn),
    [executionSettings, runDefaults.defaults, runProfilesOn]
  );
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
  const tutorial = useWorkflowTutorial();
  const run = useWorkflowRun({
    nodes,
    edges,
    workflowId,
    workflowName: workflow.workflowName,
    rawSource: workflow.rawSource,
    sourceFormat: workflow.sourceFormat,
    updateNodeData,
    showToast,
  });
  const { isRunning } = run;
  // A notification about a run opens the workflow with its run panel.
  const notifiedRun = new URLSearchParams(location.search).get("run");
  useEffect(() => {
    if (!notifiedRun) return;
    run.setPanelTab(notifiedRun === run.lastRunId ? "steps" : "history");
    run.openPanel();
    navigate(location.pathname, { replace: true });
  }, [notifiedRun, run.lastRunId, run.setPanelTab, run.openPanel, navigate, location.pathname]);
  // Closing or reloading the tab while a run goes asks first (the run goes
  // on, and opening the workflow again follows it).
  useEffect(() => {
    if (!isRunning) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isRunning]);
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
  // Verbose mode: what changes on the canvas.
  useCanvasActivity({ workflowId, nodes, edges, isLoading: workflow.isLoading });
  const { missingNfCoreComponents, reloadInstalledNfCore } =
    useLibraryNodes(nodes);
  // Analyse: the generated code checked (nextflow lint, BioFlow-Insight) and its structure.
  const analysisOn = useFeature("analysis");
  const analysis = useWorkflowAnalysis(nodes, edges, workflowName);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  // When steps run: the analysis's conditions with the Parameters node's values.
  const stepConditions = useStepConditions(analysis, nodes, useFeature("conditions") && analysisOn);
  // The editor or a graph of the code, and the connections the code makes that the canvas doesn't show.
  const canvasView = useCanvasView(nodes, edges, workflowName, {
    showCodeConnections: useFeature("connectionHints"),
  });
  // Groups of steps (#221): grouped from a selection or the analysis's suggestions.
  const grouping = useGroups({ nodes, edges, setNodes, setIsDirty, ensureEditable });
  const extraProblems = useMemo(
    () => [...canvasView.problems, ...(analysisOn ? analysis.problems : [])],
    [canvasView.problems, analysisOn, analysis.problems],
  );
  const check = useWorkflowCheck({
    nodes,
    edges,
    settings: runSettings,
    missingNfCoreComponents,
    analysisProblems: extraProblems,
  });
  // Connections whose ports don't fit; stable while a drag moves nodes.
  const hintsOn = useFeature("connectionHints");
  const hintsKey = useMemo(
    () => JSON.stringify(hintsOn ? connectionHints(nodes, edges) : {}),
    [nodes, edges, hintsOn]
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
  // The node whose steps inside are open (a subworkflow or pipeline).
  const [nestedNodeId, setNestedNodeId] = useState<string | null>(null);
  const openNested = useCallback((nodeId: string) => {
    logActivity("nested.opened", { nodeId, depth: 0 });
    setNestedNodeId(nodeId);
  }, []);
  const closeNested = useCallback(() => setNestedNodeId(null), []);
  // "Copy into new workflow" for an nf-core subworkflow: a new workflow with its steps, opened.
  const copySubworkflow = useCallback(
    async (id: string) => {
      try {
        const draft = await buildSubworkflowCopy(id);
        const response = await api.post("/workflows", draft);
        logActivity("workflow.copiedSubworkflow", { subworkflow: id, workflowId: response.data._id, nodes: draft.nodes.length });
        setNestedNodeId(null);
        navigate(`/workflow/${response.data._id}`);
        showToast(`“${draft.name}” is a new workflow with the subworkflow's steps. The original is unchanged.`, "success");
      } catch (caught) {
        showToast(getApiErrorMessage(caught, "The subworkflow couldn't be copied."), "error");
      }
    },
    [navigate, showToast],
  );
  // The save conflict dialog can be closed to keep looking; saving opens it
  // again, since nothing is saved until a version is picked.
  const [conflictDismissed, setConflictDismissed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new conflict opens the dialog again.
  useEffect(() => setConflictDismissed(false), [workflow.conflict]);
  const saveWorkflow = useCallback(() => {
    if (workflow.conflict) setConflictDismissed(false);
    else void workflow.save();
  }, [workflow]);
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
    onSave: saveWorkflow,
    onRun: () => {
      if (isRunning) return;
      if (check.blockedReason) {
        showToast(check.blockedReason, "info");
        return;
      }
      void run.run(runSettings);
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
  // Resume can be switched off in Global Settings → Features.
  const resumeOn = useFeature("resume");
  const resume = useRunResume({
    workflowId,
    enabled: !isDemoMode,
    isRunning,
    mode: runDefaults.defaults.resume,
  });

  // Why the last run failed, and the step it failed in, if the log says
  // (unless failure explanations are switched off).
  const explanationsOn = useFeature("failureExplanations");
  const failure = useMemo(
    () => (explanationsOn && !isRunning && run.output ? explainFailure(run.output) : null),
    [explanationsOn, isRunning, run.output]
  );
  const failedNodeId = failure?.process
    ? nodeIdForProcess(
        failure.process,
        nodes,
        nodes.find((node) => node.type === "pipeline")?.id
      )
    : undefined;
  const failedStepLabel = failedNodeId ? nodeLabels[failedNodeId] : undefined;
  // Zoom to the failing step: the one the log names, else the first that failed.
  const failingNodeId =
    failedNodeId ??
    (isRunning ? undefined : Object.entries(runTasks.nodeRuns).find(([, nodeRun]) => nodeRun.status === "failed")?.[0]);
  const nestedNode = nestedNodeId ? nodes.find((node) => node.id === nestedNodeId) : undefined;
  const nestedEntry = nestedNode ? nestedEntryOf(nestedNode, getProcessNameForNode(nestedNode, nodes)) : null;
  const showFailedStep = failedNodeId ? () => showNode(failedNodeId) : undefined;

  const handleProcessSelect = useCallback(
    (process: NextflowProcess) => {
      if (blockedByRun()) return;
      // The tutorial's add-node step moves on when a node is added.
      onAddNode();
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
    settings: runSettings,
    rawSource: workflow.rawSource,
    sourceFormat: workflow.sourceFormat,
  };

  // The analysis's graphs, while it is of the workflow's steps as they are.
  const analysedStructure =
    analysis.structureCurrent && analysis.analysis?.bioflow.status === "done"
      ? analysis.analysis.bioflow.result
      : null;
  const { exports, isExporting } = useWorkflowExports(workflowSource, analysedStructure, showToast);

  // Interaction flags on the nodes the canvas shows: the node of the panel
  // under the pointer is highlighted, and a run stops editing. Nodes of a
  // read-only workflow stay draggable: dropping one opens an editable copy.
  // The editor draws a frame around each group's steps.
  const canvasNodes = useMemo(
    () =>
      canvasView.nodes.map((node) =>
        node.type === "groupFrame"
          ? node
          : {
              ...node,
              data: { ...node.data, isHighlight: node.id === panels.highlightedId },
              selectable: true,
              draggable: !isRunning,
              connectable: !isRunning,
              deletable: !isRunning,
            },
      ),
    [canvasView.nodes, panels.highlightedId, isRunning]
  );
  const groupActions = useMemo(
    () => ({ rename: grouping.startRename, ungroup: (group: string) => void grouping.ungroup(group), editable: !isRunning }),
    [grouping.startRename, grouping.ungroup, isRunning],
  );
  // The graph views draw BioFlow-Insight's analysis, which needs an installation's server.
  const graphsUnavailable: GraphUnavailable | null = isDemoMode
    ? {
        reason:
          "It is drawn from BioFlow-Insight's analysis of the workflow's code, which runs on the server of an installation. The browser demo has none.",
        demo: true,
      }
    : !analysisOn
      ? { reason: "The analysis is switched off in Global Settings → Features.", demo: false }
      : null;

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
      <NestedViewContext.Provider value={openNested}>
      <CopySubworkflowContext.Provider value={copySubworkflow}>
      <NodeConditionsContext.Provider value={stepConditions}>
      <GroupActionsContext.Provider value={groupActions}>
    <NodeProblemsContext.Provider value={check.nodeProblems}>
      <ConnectionHintsContext.Provider value={edgeHints}>
      <div className="flex flex-col h-screen w-screen bg-canvas-background text-text">
        {/* Nodes are added in the editor; the graph views are read-only. */}
        {canvasView.view === "editor" && (
          <Header
            onProcessSelect={handleProcessSelect}
            onCustomNodeSaved={customNodes.applyDefinition}
            onCustomNodeDeleteRequested={customNodes.requestDelete}
          />
        )}
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
            {canvasView.view !== "editor" ? (
              <GraphView
                kind={canvasView.view}
                analysis={analysis}
                unavailable={graphsUnavailable}
                onBack={() => canvasView.setView("editor")}
                onShowInEditor={(nodeId) => {
                  canvasView.setView("editor");
                  window.setTimeout(() => showNode(nodeId), 0);
                }}
              />
            ) : (
            <Canvas
              nodes={canvasNodes}
              edges={canvasView.edges}
              onNodesChange={guards.handleNodesChange}
              onEdgesChange={guards.handleEdgesChange}
              onConnect={guards.handleConnect}
              onNodeDragStart={deletion.onNodeDragStart}
              onNodeDrag={deletion.onNodeDrag}
              onNodeDragStop={deletion.onNodeDragStop}
              onNodeDoubleClick={(_, node) => {
                if (node.type === "groupFrame") return;
                panels.open(node.id);
              }}
              isValidConnection={isValidConnection}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              history={history}
              onShowShortcuts={() => setShowShortcuts(true)}
              onZoomToFailed={failingNodeId ? () => showNode(failingNodeId) : undefined}
            />
            )}
          </ErrorBoundary>
          {canvasView.view === "editor" && grouping.selection.length > 0 && !isRunning && (
            <div
              role="toolbar"
              aria-label="Selected steps"
              className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-panel-border bg-panel-background px-3 py-1.5 text-sm text-text shadow"
            >
              {grouping.selection.length} {grouping.selection.length === 1 ? "step" : "steps"} selected
              <button
                type="button"
                onClick={() => grouping.startGrouping(grouping.selection.map((node) => node.id), "selection")}
                className="rounded border border-panel-border px-2 py-0.5 hover:bg-accent"
              >
                Group into subworkflow…
              </button>
            </div>
          )}
          {grouping.dialog && (
            <GroupDialog
              isOpen
              mode={grouping.dialog.mode}
              initialName={grouping.dialog.initialName}
              steps={grouping.dialogSteps}
              problemFor={grouping.problemFor}
              onConfirm={(name) => void grouping.confirm(name)}
              onUngroup={
                grouping.dialog.group
                  ? () => {
                      const group = grouping.dialog?.group;
                      grouping.closeDialog();
                      if (group) void grouping.ungroup(group);
                    }
                  : undefined
              }
              onClose={grouping.closeDialog}
            />
          )}
          <WorkflowTutorial tutorial={tutorial} />
          {nestedNode && nestedEntry && (
            <NestedView
              title={String(nestedNode.data.label || nestedNode.type)}
              entry={nestedEntry}
              workflowName={workflowName}
              tasks={runTasks.nodeRuns[nestedNode.id]?.tasks ?? []}
              isRunning={isRunning}
              onClose={closeNested}
            />
          )}
          {analysisOn && analysisOpen && (
            <AnalysisPanel
              state={analysis}
              nodes={nodes}
              workflowName={workflowName}
              nodeLabels={nodeLabels}
              onShowNode={(nodeId) => {
                setAnalysisOpen(false);
                showNode(nodeId);
              }}
              onGroup={
                isRunning
                  ? undefined
                  : (ids) => {
                      setAnalysisOpen(false);
                      grouping.startGrouping(ids, "suggestion");
                    }
              }
              onOpenView={(kind) => {
                setAnalysisOpen(false);
                canvasView.setView(kind);
              }}
              onClose={() => setAnalysisOpen(false)}
            />
          )}
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
          onSave={saveWorkflow}
          exports={exports}
          isExporting={isExporting}
          onRun={() => run.run(runSettings, { resume: resume.resume })}
          isSaved={workflow.isSaved}
          isSaving={workflow.isSaving}
          isRunning={isRunning}
          runBlockedReason={check.blockedReason ?? demoUnavailable}
          viewControl={
            <CanvasViewSwitch
              view={canvasView.view}
              onChange={canvasView.setView}
              graphsUnavailable={graphsUnavailable ? (graphsUnavailable.demo ? NEEDS_INSTALL : graphsUnavailable.reason) : null}
            />
          }
          analysisControl={
            analysisOn ? (
              <AnalyseButton
                running={analysis.running}
                current={analysis.current}
                onAnalyse={() => {
                  setAnalysisOpen(true);
                  if (!analysis.current && !analysis.running) void analysis.analyse();
                }}
              />
            ) : undefined
          }
          checkControl={
            check.mode === "off" && check.problems.length === 0 ? undefined : (
              <WorkflowCheckButton
                problems={check.problems}
                nodeLabels={nodeLabels}
                onShowNode={showNode}
                onRecheck={() => void check.recheck()}
                isChecking={check.isChecking}
                blocking={check.mode === "block"}
              />
            )
          }
          isLoading={workflow.isLoading}
          executionSettings={executionSettings}
          runSettings={runSettings}
          onExecutionSettingsChange={handleExecutionSettingsChange}
          onShowRuns={run.openPanel}
          resume={
            resumeOn
              ? {
                  available: resume.available && !demoUnavailable,
                  unavailableReason: demoUnavailable,
                  on: resume.resume,
                  onChange: resume.setResume,
                }
              : undefined
          }
          settingsExtra={
            resumeOn ? (
              <NeedsInstall>
                <RunCacheSettings
                  cache={resume.cache}
                  onClear={() => void resume.clear()}
                  isClearing={resume.isClearing}
                  isRunning={isRunning}
                  error={resume.error}
                />
              </NeedsInstall>
            ) : undefined
          }
        />
        <CopyPromptDialog
          isOpen={workflow.isCopyPromptOpen}
          workflowName={workflowName}
          onCopy={() => void workflow.confirmCopy()}
          onJustLook={workflow.declineCopy}
        />
        <SaveConflictDialog
          isOpen={workflow.conflict !== null && !conflictDismissed}
          workflowName={workflowName}
          onReload={workflow.reloadSaved}
          onSaveAsCopy={() => void workflow.saveAsCopy()}
          onOverwrite={() => void workflow.overwriteSaved()}
          onClose={() => setConflictDismissed(true)}
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
            onRetry={() => {
              run.dismissError();
              void run.run(runSettings);
            }}
            onResume={
              resume.available
                ? () => {
                    run.dismissError();
                    void run.run(runSettings, { resume: true });
                  }
                : undefined
            }
            onShowLog={run.showLog}
            error={run.error}
            explanation={failure}
            stepLabel={failedStepLabel}
            onShowStep={showFailedStep}
            onShowEvidence={run.showLogLine}
          />
        )}
        <ExecutionStatusPanel
          status={run.executionStatus.status}
          nodes={canvasNodes}
          onCancel={run.executionStatus.cancelExecution}
          canCancel={run.canCancel}
          // Always there: minimized, it is the Runs bar.
          isVisible
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
          logHighlight={run.logHighlight}
          onShowLogLine={run.showLogLine}
          stages={
            run.lastRunId || isRunning
              ? runStages({
                  nodes,
                  edges,
                  nodeRuns: runTasks.nodeRuns,
                  consoleProcesses: run.executionStatus.status.totalProcesses,
                })
              : []
          }
          // In the order their first task started.
          steps={Object.entries(runTasks.nodeRuns).map(([id, nodeRun]) => ({
            id,
            label: nodes.find((node) => node.id === id)?.data.label || id,
            status: nodeRun.status,
            done: nodeRun.done,
            total: nodeRun.total,
            cached: nodeRun.cached,
            ignored: nodeRun.ignored,
            running: nodeRun.running,
            substeps: nodeRun.processes?.map((process) => ({
              id: process.process,
              label: process.label,
              status: process.status,
              done: process.done,
              total: process.total,
              cached: process.cached,
              ignored: process.ignored,
              running: process.running,
            })),
          }))}
        />
      </div>
      </ConnectionHintsContext.Provider>
      </NodeProblemsContext.Provider>
      </GroupActionsContext.Provider>
    </NodeConditionsContext.Provider>
      </CopySubworkflowContext.Provider>
      </NestedViewContext.Provider>
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
