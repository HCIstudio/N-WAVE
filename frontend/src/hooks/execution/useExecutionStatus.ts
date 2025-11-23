import { useState, useEffect, useCallback, useRef } from "react";
import type { Node } from "reactflow";
import type { NodeData } from "../../components/nodes/BaseNode";
import type { WorkflowExecutionStatus, NodeExecutionStatus } from "../../components/common/workflow/ExecutionStatusPanel";

const DBG = (msg?: any, ...rest: any[]) => {
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("debugStatus")) console.log("[execution-status]", msg, ...rest);
  } catch {}
};

interface UseExecutionStatusOptions {
  nodes: Node<NodeData>[];
  onStatusChange?: (status: WorkflowExecutionStatus) => void;
  executionId?: string | null;
}

function coercePercent(j: any, prev: number): number {
  const cand = [j?.overallProgress, j?.progress, j?.percent, j?.percentage, j?.progressPercent];
  for (const v of cand) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  }
  if (Number.isFinite(j?.completed) && Number.isFinite(j?.total) && j.total > 0) {
    return Math.max(0, Math.min(100, Math.round((j.completed / j.total) * 100)));
  }
  return prev;
}

function coerceNodeStatuses(j: any): NodeExecutionStatus[] | undefined {
  if (Array.isArray(j?.nodeStatuses)) return j.nodeStatuses;
  if (j?.nodes && typeof j.nodes === "object") return Object.values(j.nodes);
  return undefined;
}

async function fetchStatus(executionId: string): Promise<any> {
  const endpoints = [
    `/api/execute/nextflow/status?runId=${encodeURIComponent(executionId)}`,
    `/api/execute/nextflow-status?runId=${encodeURIComponent(executionId)}`,
    `/api/execute/status?runId=${encodeURIComponent(executionId)}`,
  ];
  for (const url of endpoints) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const j = await r.json();
      DBG("STATUS from", url, j);
      return j;
    } catch {}
  }
  throw new Error("No status endpoint responded");
}

export const useExecutionStatus = ({ nodes, onStatusChange, executionId }: UseExecutionStatusOptions) => {
  const [status, setStatus] = useState<WorkflowExecutionStatus>({
    isRunning: false,
    completed: 0,
    total: nodes.length,
    runtimeSeconds: 0,
    nodeStatuses: [],
    currentStage: "Idle" as any,
    overallProgress: 0 as any,
  } as any);

  const [isVisible, setIsVisible] = useState(false);
  const runtimeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<Date | null>(null);

  const startExecution = useCallback(() => {
    startTimeRef.current = new Date();
    setStatus((prev: any) => ({
      ...prev,
      isRunning: true,
      runtimeSeconds: 0,
      nodeStatuses: [],
      currentStage: "Starting workflow execution...",
      overallProgress: 0,
      startTime: startTimeRef.current!,
      total: nodes.length,
      completed: 0,
    }));
    setIsVisible(true);

    if (runtimeTimer.current) clearInterval(runtimeTimer.current);
    runtimeTimer.current = setInterval(() => {
      setStatus((prev: any) => {
        if (!prev.isRunning || !prev.startTime) return prev;
        const seconds = Math.max(0, Math.floor((Date.now() - prev.startTime.getTime()) / 1000));
        return { ...prev, runtimeSeconds: seconds };
      });
    }, 1000);
  }, [nodes.length]);

  const completeExecution = useCallback((success: boolean) => {
    if (runtimeTimer.current) {
      clearInterval(runtimeTimer.current);
      runtimeTimer.current = null;
    }
    if (pollingTimer.current) {
      clearTimeout(pollingTimer.current);
      pollingTimer.current = null;
    }
    setStatus((prev: any) => ({
      ...prev,
      isRunning: false,
      overallProgress: success ? 100 : prev.overallProgress,
      currentStage: success ? "Execution completed." : "Execution failed.",
      endTime: new Date(),
    }));
  }, []);

  const cancelExecution = useCallback(() => {
    if (runtimeTimer.current) {
      clearInterval(runtimeTimer.current);
      runtimeTimer.current = null;
    }
    if (pollingTimer.current) {
      clearTimeout(pollingTimer.current);
      pollingTimer.current = null;
    }
    setStatus((prev: any) => ({
      ...prev,
      isRunning: false,
      currentStage: "Execution cancelled.",
    }));
  }, []);

  const parseNextflowOutput = useCallback((output: string) => {
    const lines = output.split("\n");
    lines.forEach((line) => {
      const m = line.match(/PROGRESS\s+(\d{1,3})/i);
      if (m) {
        const p = Math.max(0, Math.min(100, parseInt(m[1], 10)));
        setStatus((prev: any) => ({ ...prev, overallProgress: p }));
      }
    });
  }, []);

  const hideStatus = () => setIsVisible(false);
  const showStatus = () => setIsVisible(true);

  useEffect(() => {
    if (!status.isRunning || !executionId) return;

    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const j = await fetchStatus(executionId);
        const state: string | undefined = (j?.state ?? j?.status) as any;
        const nextPercent = coercePercent(j, (status as any).overallProgress ?? 0);
        const maybeNodes = coerceNodeStatuses(j);

        setStatus((prev: any) => ({
          ...prev,
          overallProgress: nextPercent,
          currentStage:
            state === "succeeded"
              ? "Execution completed."
              : state === "failed"
              ? "Execution failed."
              : prev.currentStage,
          nodeStatuses: maybeNodes ?? prev.nodeStatuses,
          completed:
            maybeNodes
              ? maybeNodes.filter((n: any) => n.status === "success" || n.status === "error").length
              : prev.completed,
          total: maybeNodes ? maybeNodes.length : (prev.total ?? nodes.length),
        }));

        if (state === "succeeded" || state === "failed") {
          stopped = true;
          completeExecution(state === "succeeded");
          return;
        }
      } catch {}
      if (!stopped) {
        pollingTimer.current = setTimeout(tick, 1500);
      }
    };

    tick();
    return () => {
      stopped = true;
      if (pollingTimer.current) {
        clearTimeout(pollingTimer.current);
        pollingTimer.current = null;
      }
    };
  }, [status.isRunning, executionId, nodes.length, completeExecution]);

  useEffect(() => {
    onStatusChange?.(status as any);
  }, [status, onStatusChange]);

  return {
    status: status as any,
    isVisible,
    startExecution,
    completeExecution,
    cancelExecution,
    parseNextflowOutput,
    hideStatus,
    showStatus,
  };
};