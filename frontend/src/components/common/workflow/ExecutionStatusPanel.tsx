import type React from "react";
import {
  Pause,
  CheckCircle,
  XCircle,
  X,
  Clock,
  Activity,
  Cpu,
  HardDrive,
} from "lucide-react";
import type { Node } from "reactflow";
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
}

interface ExecutionStatusPanelProps {
  status: WorkflowExecutionStatus;
  nodes: Node<NodeData>[];
  onCancel?: () => void;
  onClose?: () => void;
  isVisible: boolean;
}

const ExecutionStatusPanel: React.FC<ExecutionStatusPanelProps> = ({
  status,
  onClose,
  isVisible,
}) => {
  if (!isVisible) return null;

  const getStatusIcon = (nodeStatus: NodeExecutionStatus["status"]) => {
    switch (nodeStatus) {
      case "waiting":
        return <Clock className="w-4 h-4 text-gray-400" />;
      case "running":
        return <Activity className="w-4 h-4 text-blue-500 animate-pulse" />;
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
      (duration % 3600) / 60
    )}m`;
  };

  const formatEstimatedTime = (seconds?: number) => {
    if (!seconds) return "Unknown";
    if (seconds < 60) return `~${Math.ceil(seconds)}s`;
    if (seconds < 3600) return `~${Math.ceil(seconds / 60)}m`;
    return `~${Math.ceil(seconds / 3600)}h`;
  };

  return (
    <div className="fixed bottom-4 right-4 bg-[#fcfcfc] border border-gray-600 rounded-lg shadow-lg w-96 max-h-96 overflow-hidden z-50">
      {/* Header */}
      <div className="bg-nextflow-green text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status.isRunning ? (
            <Activity className="w-5 h-5 animate-pulse" />
          ) : (
            <CheckCircle className="w-5 h-5" />
          )}
          <h3 className="font-semibold">
            {status.isRunning ? "Workflow Running" : "Workflow Complete"}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Cancel button removed - cancellation not fully working */}
          {onClose && (
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors p-0.5 rounded hover:bg-white/20"
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Overview */}
      <div className="p-4 border-b border-gray-300">
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-nextflow-green">
              {status.completedNodes}
            </div>
            <div className="text-xs text-gray-700">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-500">
              {status.runningNodes}
            </div>
            <div className="text-xs text-gray-700">Running</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-2">
          <div className="flex justify-between text-xs text-gray-800 mb-1">
            <span>Progress</span>
            <span>{Math.round(status.overallProgress)}%</span>
          </div>
          <div className="w-full bg-gray-300 rounded-full h-2">
            <div
              className="bg-nextflow-green h-2 rounded-full transition-all duration-300"
              style={{ width: `${status.overallProgress}%` }}
            />
          </div>
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
      </div>

      {/* Node Status List */}
      <div className="max-h-80 overflow-y-auto">
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
  );
};

export default ExecutionStatusPanel;
