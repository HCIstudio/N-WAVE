
import React, { useEffect, useMemo } from "react";
import { X, Clock, Activity, CheckCircle, XCircle } from "lucide-react";
import type { Node } from "reactflow";
import type { NodeData } from "../../nodes/BaseNode";

/** Keep these exported for other modules */
export interface NodeExecutionStatus {
  nodeId: string;
  nodeName: string;
  status: "waiting" | "running" | "success" | "error" | "skipped";
  progress?: number;
  startTime?: Date;
  endTime?: Date;
}

export interface WorkflowExecutionStatus {
  isRunning: boolean;
  /** optional legacy fields */
  completed?: number;
  total?: number;
  runtimeSeconds?: number;
  /** new shape coming from the hook */
  nodeStatuses?: NodeExecutionStatus[];
  /** legacy shape used elsewhere */
  nodes?: Record<string, NodeExecutionStatus>;
  startTime?: Date;
  endTime?: Date;
  error?: string | null;
}

type Props = {
  status: WorkflowExecutionStatus;
  nodes: Node<NodeData>[];
  onCancel: () => void;
  onClose: () => void;
  isVisible: boolean;
};

const statusIcon = (s: NodeExecutionStatus["status"]) => {
  switch (s) {
    case "running":
      return <Activity className="w-4 h-4" aria-hidden />;
    case "success":
      return <CheckCircle className="w-4 h-4" aria-hidden />;
    case "error":
      return <XCircle className="w-4 h-4" aria-hidden />;
    default:
      return <Clock className="w-4 h-4" aria-hidden />;
  }
};

const statusColor = (s: NodeExecutionStatus["status"]) => {
  switch (s) {
    case "running":
      return "text-blue-600";
    case "success":
      return "text-green-600";
    case "error":
      return "text-red-600";
    default:
      return "text-gray-500";
  }
};

const niceDuration = (seconds?: number) => {
  if (!seconds || seconds < 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
};

const toMap = (status: WorkflowExecutionStatus): Record<string, NodeExecutionStatus> => {
  // Prefer explicit record
  if (status.nodes && Object.keys(status.nodes).length) return status.nodes;
  // Fall back to array form
  const map: Record<string, NodeExecutionStatus> = {};
  (status.nodeStatuses || []).forEach((n) => {
    map[n.nodeId] = n;
  });
  return map;
};

const computeTotals = (status: WorkflowExecutionStatus, rows: NodeExecutionStatus[]) => {
  const total = status.total || rows.length || 0;
  let completed = status.completed;
  if (completed == null) {
    completed = rows.filter((r) => r.status === "success" || r.status === "error").length;
  }
  return { total, completed };
};

const ExecutionStatusPanel: React.FC<Props> = ({
  status,
  nodes,
  onCancel,
  onClose,
  isVisible,
}) => {
  if (!isVisible) return null;

  // Derive a stable row list based on current canvas nodes
  const rows: NodeExecutionStatus[] = useMemo(() => {
    const byId = toMap(status);
    const ordered = nodes.map((n) => {
      const fallbackName = (n.data as any)?.label || n.id;
      const s = byId[n.id];
      if (s) {
        // normalize 'skipped' -> 'waiting' for UI
        const normalized = s.status === "skipped" ? "waiting" : s.status;
        return { ...s, nodeName: s.nodeName || fallbackName, status: normalized };
      }
      return { nodeId: n.id, nodeName: fallbackName, status: "waiting" as const };
    });
    // include any that aren't present on canvas (defensive for legacy runs)
    const extras = Object.values(byId).filter((x) => !ordered.find((r) => r.nodeId === x.nodeId));
    return [...ordered, ...extras];
  }, [nodes, status]);

  // Prefer API-reported overallProgress if available; fallback to derived totals
  const { total, completed } = useMemo(() => computeTotals(status, rows), [status, rows]);
  const percent = useMemo(() => {
    if (typeof (status as any).overallProgress === "number") {
      const p = (status as any).overallProgress;
      if (!Number.isNaN(p)) return Math.max(0, Math.min(100, Math.round(p)));
    }
    const t = Math.max(1, total || 1);
    const d = Math.min(t, Math.max(0, completed || 0));
    return Math.round((d / t) * 100);
  }, [status, total, completed]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40">
      <div className="w-full sm:max-w-2xl mx-auto bg-white rounded-xl shadow-2xl border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5" aria-hidden />
            <h2 className="font-semibold">
              Execution Status <span className="text-xs text-purple-600">(NEW)</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100"
            aria-label="Close execution status"
            title="Close"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        {/* Progress */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600">
              {status.isRunning ? "Running…" : status.error ? "Failed" : "Completed"}
            </span>
            <span className="font-medium">{percent}%</span>
          </div>
          <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
            <Clock className="w-3 h-3" aria-hidden /> {niceDuration(status.runtimeSeconds)}{status && (status as any).currentStage ? ` • ${(status as any).currentStage}` : ""}
          </div>
        </div>

        {/* Node list */}
        <div className="px-4 pb-4 max-h-80 overflow-auto">
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.nodeId} className="py-2 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={["shrink-0", statusColor(row.status)].join(" ")}>
                    {statusIcon(row.status)}
                  </span>
                  <span className="truncate text-sm">{row.nodeName}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {row.status === "running"
                    ? "Running"
                    : row.status === "success"
                    ? "Success"
                    : row.status === "error"
                    ? "Error"
                    : "Waiting"}
                  {typeof row.progress === "number" ? ` • ${row.progress}%` : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer actions */}
        <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
          {status.isRunning ? (
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md bg-gray-900 text-white text-sm"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExecutionStatusPanel;
