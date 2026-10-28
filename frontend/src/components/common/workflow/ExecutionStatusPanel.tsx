import type React from "react";
import {
  Pause,
  CheckCircle,
  XCircle,
  AlertTriangle,
  X,
  Clock,
  Hourglass,
  Cpu,
  HardDrive,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  History,
} from "lucide-react";
import { useState } from "react";
import RunResultsList from "./RunResultsList";
import RunHistory, { RunLog } from "./RunHistory";
import FailureExplanationCard from "./FailureExplanationCard";
import type { FailureExplanation } from "../../../execution/failureExplanations";
import type { Node } from "@xyflow/react";
import type { NodeData } from "../../nodes/BaseNode";

export interface NodeExecutionStatus {
  nodeId: string;
  nodeName: string;
  status: "waiting" | "running" | "success" | "error" | "skipped";
  startTime?: Date;
  endTime?: Date;
  progress?: number;
  output?: string;
  error?: string;
  container?: string;
  resources?: {
    cpus: number;
    memory: string;
    actualCpuUsage?: number;
    actualMemoryUsage?: number;
  };
}

export interface WorkflowExecutionStatus {
  isRunning: boolean;
  startTime?: Date;
  endTime?: Date;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  runningNodes: number;
  nodeStatuses: NodeExecutionStatus[];
  currentStage?: string;
  overallProgress: number;
  estimatedTimeRemaining?: number;
  /**
   * The run's Nextflow processes, from its console: those listed plus the
   * "Plus N more processes waiting for tasks…". Unknown until it says.
   */
  totalProcesses?: number;
  /** Processes Nextflow marked finished (✔). */
  finishedProcesses?: number;
}

interface ExecutionStatusPanelProps {
  status: WorkflowExecutionStatus;
  nodes: Node<NodeData>[];
  onCancel?: () => void;
  /** False until the run's id is known (it's the first line of output). */
  canCancel?: boolean;
  onClose?: () => void;
  isVisible: boolean;
  /** The run's id, once known: links its results after it finishes. */
  runId?: string | null;
  /** The current run's output, as it streams in. */
  output?: string;
  /** The saved workflow's id: its earlier runs show under History. */
  workflowId?: string | null;
  tab?: RunPanelTab;
  onTabChange?: (tab: RunPanelTab) => void;
  /**
   * The canvas nodes the run's tasks belong to (from Nextflow's log), named
   * as on the canvas. Shown instead of the console's process names.
   */
  steps?: RunStep[];
  /** Collapsed to a small bar; the bottom bar's Run button expands it. */
  minimized?: boolean;
  onMinimizedChange?: (minimized: boolean) => void;
  /** Why the finished run failed, when its log shows a common reason. */
  failure?: FailureExplanation | null;
  /** The canvas step that failed, and how to show it. */
  failedStepLabel?: string;
  onShowFailedStep?: () => void;
}

export interface RunStep {
  id: string;
  label: string;
  /** "cached": reused from an earlier run's cache (a resumed run). */
  status: "running" | "succeeded" | "failed" | "cached";
  done: number;
  total: number;
  /** Tasks reused from the cache. */
  cached?: number;
  /** Tasks that failed but whose error Nextflow ignores. */
  ignored?: number;
  /** Tasks going now. */
  running?: number;
  /** The processes of a step that runs several (a subworkflow, a pipeline). */
  substeps?: RunStep[];
}

const STEP_ICON: Record<RunStep["status"], React.ReactNode> = {
  running: <Hourglass className="h-4 w-4 animate-pulse text-blue-500" />,
  succeeded: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  cached: <RotateCcw className="h-4 w-4 text-sky-600" />,
};

/** A step that went on past an ignored error gets a warning sign. */
const stepIcon = (step: RunStep): React.ReactNode =>
  step.ignored && step.status !== "failed" && step.status !== "running" ? (
    <AlertTriangle className="h-4 w-4 text-amber-500" />
  ) : (
    STEP_ICON[step.status]
  );

/** How many of a step's tasks are done, as the steps list shows it. */
const stepCount = (step: RunStep): string => {
  const count =
    step.status === "cached"
      ? "reused from cache"
      : step.cached
        ? `${step.done} of ${step.total}, ${step.cached} reused`
        : `${step.done} of ${step.total}`;
  return step.ignored
    ? `${count}, ${step.ignored} error${step.ignored === 1 ? "" : "s"} ignored`
    : count;
};

export type RunPanelTab = "steps" | "log" | "history";

const TABS: { id: RunPanelTab; label: string }[] = [
  { id: "steps", label: "Steps" },
  { id: "log", label: "Log" },
  { id: "history", label: "History" },
];

const ExecutionStatusPanel: React.FC<ExecutionStatusPanelProps> = ({
  status,
  onCancel,
  canCancel = true,
  onClose,
  isVisible,
  runId,
  output = "",
  workflowId,
  tab = "steps",
  onTabChange,
  steps = [],
  minimized = false,
  onMinimizedChange,
  failure,
  failedStepLabel,
  onShowFailedStep,
}) => {
  const [maximized, setMaximized] = useState(false);
  if (!isVisible) return null;
  // Opened before any run in this session: only the history has content.
  const hasRun = Boolean(status.startTime) || status.isRunning;
  const isCancelled = status.currentStage === "Workflow cancelled";
  const isFailed =
    !status.isRunning &&
    !isCancelled &&
    (status.failedNodes > 0 || /failed/i.test(status.currentStage ?? ""));

  const title = !hasRun
    ? "Runs"
    : status.isRunning
      ? "Workflow Running"
      : isCancelled
        ? "Workflow Cancelled"
        : isFailed
          ? "Workflow Failed"
          : "Workflow Complete";
  const statusIcon = !hasRun ? (
    <History className="w-5 h-5" aria-hidden />
  ) : status.isRunning ? (
    <Hourglass className="w-5 h-5 animate-pulse" aria-hidden />
  ) : isCancelled || isFailed ? (
    <XCircle className="w-5 h-5" aria-hidden />
  ) : (
    <CheckCircle className="w-5 h-5" aria-hidden />
  );
  // While a run goes the panel only minimizes: closing it would hide the
  // only place that says the canvas is busy.
  const canClose = Boolean(onClose) && !status.isRunning;
  const closeButton = canClose && (
    <button
      type="button"
      onClick={onClose}
      className="text-white hover:text-gray-200 transition-colors p-0.5 rounded hover:bg-white/20"
      title="Close panel"
      aria-label="Close run panel"
    >
      <X className="w-4 h-4" />
    </button>
  );
  const stepsCached = steps.filter((step) => step.status === "cached").length;
  // Nextflow learns of tasks as the run goes, so their total grows: progress
  // is told by what's done and running, not as a share of an unknown whole.
  const tasksDone = steps.length > 0
    ? steps.reduce((sum, step) => sum + step.done, 0)
    : status.completedNodes;
  const tasksRunning = steps.length > 0
    ? steps.reduce((sum, step) => sum + (step.running ?? 0), 0)
    : status.runningNodes;
  // Without the run's tasks (the demo), the console's processes are counted.
  const unit = steps.length > 0 ? "task" : "step";
  const progressText = `${tasksDone} ${unit}${tasksDone === 1 ? "" : "s"} done${
    status.isRunning ? `, ${tasksRunning} running` : ""
  }`;
  // Nextflow's console says how many processes (steps) the run has in all.
  const totalProcesses = status.totalProcesses ?? 0;
  const finishedProcesses = Math.min(
    status.finishedProcesses ?? 0,
    totalProcesses,
  );
  const stepsText =
    totalProcesses > 0
      ? `${finishedProcesses} of ${totalProcesses} steps finished`
      : null;
  const failureCard = isFailed && failure && (
    <FailureExplanationCard
      explanation={failure}
      stepLabel={failedStepLabel}
      onShowStep={onShowFailedStep}
    />
  );

  // The Runs bar: like the bottom bar (same height, same line), at the
  // right. It stays when the panel is open, which unfolds above it.
  const barIcon = !hasRun ? (
    <History className="h-4 w-4 text-text-light" aria-hidden />
  ) : status.isRunning ? (
    <Hourglass className="h-4 w-4 animate-pulse text-nextflow-green" aria-hidden />
  ) : isCancelled || isFailed ? (
    <XCircle className="h-4 w-4 text-red-400" aria-hidden />
  ) : (
    <CheckCircle className="h-4 w-4 text-nextflow-green" aria-hidden />
  );
  const toggle = () => onMinimizedChange?.(!minimized);
  const bar = (
    <section
      aria-label="Runs"
      // Under the node menu (z-10), which can reach down to it.
      className="fixed bottom-4 right-4 z-[9] flex items-center gap-1 rounded-lg border border-accent bg-background p-1 text-text shadow-lg"
    >
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        title={
          minimized
            ? hasRun
              ? "Show the run's steps and log"
              : "Show this workflow's runs"
            : "Fold the run panel away"
        }
      >
        {barIcon}
        <span>{title}</span>
        {status.isRunning && (stepsText || steps.length > 0 || tasksDone > 0) && (
          <span className="text-text-light">{stepsText ?? progressText}</span>
        )}
      </button>
      <button
        type="button"
        onClick={toggle}
        className="rounded-md p-1.5 transition-colors hover:bg-accent"
        aria-label={minimized ? "Expand run panel" : "Collapse run panel"}
        title={minimized ? "Expand run panel" : "Collapse run panel"}
      >
        {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {closeButton && minimized && (
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 transition-colors hover:bg-accent"
          title="Close panel"
          aria-label="Close run panel"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </section>
  );

  if (minimized) return bar;

  const getStatusIcon = (nodeStatus: NodeExecutionStatus["status"]) => {
    switch (nodeStatus) {
      case "waiting":
        return <Clock className="w-4 h-4 text-gray-400" />;
      case "running":
        return <Hourglass className="w-4 h-4 text-blue-500 animate-pulse" />;
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "skipped":
        return <Pause className="w-4 h-4 text-gray-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatDuration = (start?: Date, end?: Date) => {
    if (!start) return "--";
    const endTime = end || new Date();
    const duration = Math.floor((endTime.getTime() - start.getTime()) / 1000);

    if (duration < 60) return `${duration}s`;
    if (duration < 3600)
      return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor(
      (duration % 3600) / 60,
    )}m`;
  };

  const formatEstimatedTime = (seconds?: number) => {
    if (!seconds) return "Unknown";
    if (seconds < 60) return `~${Math.ceil(seconds)}s`;
    if (seconds < 3600) return `~${Math.ceil(seconds / 60)}m`;
    return `~${Math.ceil(seconds / 3600)}h`;
  };

  return (
    <>
      {bar}
      <section
        aria-label="Run panel"
        // Unfolded above the Runs bar (and the bottom bar's line).
        className={`fixed right-4 z-50 flex flex-col overflow-hidden rounded-lg border border-gray-600 bg-[#fcfcfc] shadow-lg ${
          maximized
            ? "top-4 bottom-16 left-4 sm:left-auto sm:w-[min(72rem,calc(100vw-2rem))]"
            : "bottom-16 h-[min(34rem,calc(100vh-5.5rem))] w-[min(44rem,calc(100vw-2rem))]"
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between bg-nextflow-green px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            {statusIcon}
            <h3 className="font-semibold">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {status.isRunning && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={!canCancel}
                className="rounded px-2 py-0.5 text-sm text-white ring-1 ring-white/60 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                title="Stop the run, its tasks and containers"
              >
                Cancel run
              </button>
            )}
            {onMinimizedChange && (
              <button
                type="button"
                onClick={() => onMinimizedChange(true)}
                className="rounded p-0.5 text-white transition-colors hover:bg-white/20 hover:text-gray-200"
                aria-label="Minimize run panel"
                title="Minimize run panel"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setMaximized((value) => !value)}
              className="rounded p-0.5 text-white transition-colors hover:bg-white/20 hover:text-gray-200"
              aria-label={maximized ? "Restore panel size" : "Maximize panel"}
              title={maximized ? "Restore panel size" : "Maximize panel"}
            >
              {maximized ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
            {closeButton}
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Run panel views"
          className="flex shrink-0 gap-1 border-b border-gray-300 px-2 pt-2"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => onTabChange?.(item.id)}
              className={`rounded-t px-3 py-1.5 text-sm ${
                tab === item.id
                  ? "border border-b-0 border-gray-300 bg-white font-semibold text-gray-900"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "log" && (
          <div role="tabpanel" aria-label="Log" className="flex min-h-0 flex-1 flex-col">
            {failureCard && <div className="shrink-0 p-2 pb-0">{failureCard}</div>}
            <div className="min-h-0 flex-1">
              <RunLog text={output} />
            </div>
          </div>
        )}
        {tab === "history" && (
          <div role="tabpanel" aria-label="History" className="min-h-0 flex-1">
            <RunHistory
              workflowId={workflowId}
              refreshKey={`${runId ?? ""}:${status.isRunning}`}
            />
          </div>
        )}
        {tab === "steps" && !hasRun && (
          <p
            role="tabpanel"
            aria-label="Steps"
            className="p-4 text-sm text-gray-700"
          >
            No run yet in this session. Click Run Workflow, or look under History
            for earlier runs.
          </p>
        )}
        {tab === "steps" && hasRun && (
          <div
            role="tabpanel"
            aria-label="Steps"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {failureCard && <div className="p-2 pb-0">{failureCard}</div>}
            {/* Progress Overview */}
            <div className="p-4 border-b border-gray-300">
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-nextflow-green">
                    {tasksDone}
                  </div>
                  <div className="text-xs text-gray-700">
                    {steps.length > 0 ? "Tasks done" : "Completed"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-500">
                    {status.isRunning ? tasksRunning : 0}
                  </div>
                  <div className="text-xs text-gray-700">Running</div>
                </div>
              </div>

              {/* Progress: how far isn't known until Nextflow is done. */}
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-800 mb-1">
                  <span>Progress</span>
                  <span>
                    {status.isRunning && stepsText
                      ? stepsText
                      : status.isRunning
                      ? "Still running…"
                      : isCancelled
                        ? "Stopped"
                        : isFailed
                          ? "Failed"
                          : "Done"}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Run progress"
                  aria-valuetext={
                    status.isRunning ? (stepsText ?? progressText) : undefined
                  }
                  aria-valuenow={
                    !status.isRunning
                      ? totalProcesses || 1
                      : totalProcesses > 0
                        ? finishedProcesses
                        : undefined
                  }
                  aria-valuemin={0}
                  aria-valuemax={totalProcesses || 1}
                  className="relative h-2 w-full overflow-hidden rounded-full bg-gray-300"
                >
                  {status.isRunning && totalProcesses > 0 ? (
                    // Steps finished out of all: a count, not a time estimate.
                    <div
                      className="h-2 rounded-full bg-nextflow-green transition-all duration-300"
                      style={{
                        width: `${(finishedProcesses / totalProcesses) * 100}%`,
                      }}
                    />
                  ) : status.isRunning ? (
                    <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-nextflow-green animate-indeterminate motion-reduce:w-full motion-reduce:animate-pulse" />
                  ) : (
                    <div
                      className={`h-2 w-full rounded-full ${
                        isCancelled
                          ? "bg-gray-500"
                          : isFailed
                            ? "bg-red-500"
                            : "bg-nextflow-green"
                      }`}
                    />
                  )}
                </div>
                {status.isRunning && (
                  <p className="mt-1 text-xs text-gray-700">
                    {stepsText
                      ? "Steps differ a lot in how long they take, so this isn't a time estimate."
                      : `${progressText}. How many steps are left isn't known yet.`}
                  </p>
                )}
              </div>

              {/* Time Information */}
              <div className="flex justify-between text-xs text-gray-800">
                <span>
                  Runtime: {formatDuration(status.startTime, status.endTime)}
                </span>
                {status.isRunning && status.estimatedTimeRemaining && (
                  <span>
                    ETA: {formatEstimatedTime(status.estimatedTimeRemaining)}
                  </span>
                )}
              </div>

              {status.currentStage && (
                <div className="mt-2 text-sm text-gray-800">
                  Current: {status.currentStage}
                </div>
              )}

              {runId && !status.isRunning && !isCancelled && (
                <section
                  aria-label="Run results"
                  className="mt-3 space-y-1 border-t border-gray-300 pt-2 text-gray-800"
                >
                  <h4 className="text-sm font-semibold">Results</h4>
                  <RunResultsList runId={runId} label="Run reports" />
                </section>
              )}
            </div>

            {/* Steps by canvas node, when the run's tasks are known */}
            {stepsCached > 0 && (
              <p className="flex items-center gap-2 border-b border-gray-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {stepsCached === 1 ? "1 step was" : `${stepsCached} steps were`} reused
                from the cache of the last run: their code and inputs hadn't changed.
              </p>
            )}
            {steps.length > 0 && (
              <ul aria-label="Steps of this run">
                {steps.map((step) => (
                  <li
                    key={step.id}
                    className="border-b border-gray-200 last:border-b-0"
                  >
                    <div className="flex items-center justify-between p-3">
                      <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                        {stepIcon(step)}
                        {step.label}
                      </span>
                      <span className="text-xs text-gray-700">
                        {stepCount(step)}
                      </span>
                    </div>
                    {step.substeps && step.substeps.length > 0 && (
                      <ul
                        aria-label={`Steps of ${step.label}`}
                        className="-mt-1 pb-2 pl-9 pr-3"
                      >
                        {step.substeps.map((substep) => (
                          <li
                            key={substep.id}
                            className="flex items-center justify-between gap-2 py-0.5"
                          >
                            <span className="flex min-w-0 items-center gap-1.5 text-xs text-gray-800">
                              <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">
                                {stepIcon(substep)}
                              </span>
                              <span className="truncate font-mono" title={substep.id}>
                                {substep.label}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-gray-700">
                              {stepCount(substep)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {/* Node Status List (from the console output) */}
            <div hidden={steps.length > 0}>
              {status.nodeStatuses.map((nodeStatus) => (
                <div
                  key={nodeStatus.nodeId}
                  className="p-3 border-b border-gray-200 last:border-b-0 hover:bg-gray-100"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(nodeStatus.status)}
                      <span className="font-medium text-sm truncate text-gray-800">
                        {nodeStatus.nodeName}
                      </span>
                    </div>
                    <span className="text-xs text-gray-700">
                      {formatDuration(nodeStatus.startTime, nodeStatus.endTime)}
                    </span>
                  </div>

                  {/* Progress bar for running nodes */}
                  {nodeStatus.status === "running" &&
                    nodeStatus.progress !== undefined && (
                      <div className="mb-1">
                        <div className="w-full bg-gray-300 rounded-full h-1">
                          <div
                            className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                            style={{ width: `${nodeStatus.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                  {/* Container and resource info */}
                  {nodeStatus.container && (
                    <div className="text-xs text-gray-700 mb-1">
                      📦 {nodeStatus.container}
                    </div>
                  )}

                  {nodeStatus.resources && (
                    <div className="flex items-center gap-3 text-xs text-gray-700">
                      <div className="flex items-center gap-1">
                        <Cpu className="w-3 h-3" />
                        <span>{nodeStatus.resources.cpus} CPU</span>
                        {nodeStatus.resources.actualCpuUsage && (
                          <span className="text-blue-500">
                            ({nodeStatus.resources.actualCpuUsage}%)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3" />
                        <span>{nodeStatus.resources.memory}</span>
                        {nodeStatus.resources.actualMemoryUsage && (
                          <span className="text-blue-500">
                            ({nodeStatus.resources.actualMemoryUsage}%)
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Error message */}
                  {nodeStatus.status === "error" && nodeStatus.error && (
                    <div className="text-xs text-red-600 mt-1 bg-red-50 p-1 rounded">
                      {nodeStatus.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
};

export default ExecutionStatusPanel;
