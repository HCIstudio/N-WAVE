import { useState, useEffect, useCallback, useRef } from "react";
import type { Node } from "@xyflow/react";
import type { NodeData } from "../../components/nodes/BaseNode";
import { getExecutionLabelForProcessName } from "../../registry";
import type {
  WorkflowExecutionStatus,
  NodeExecutionStatus,
} from "../../components/common/workflow/ExecutionStatusPanel";

// Colours and styles in Nextflow's console output.
const ANSI_CODES = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/**
 * A process in Nextflow's progress: "[-        ] NAME -" before its first
 * task, "[ab/123456] NAME (tag) | 2 of 3" after. Group 1 is the name.
 */
const PROCESS_LINE =
  /^\[(?:-\s*|[0-9a-f]{2}\/[0-9a-f]{6})\]\s+(\S+)(?:\s+\([^)]*\))?\s*(?:-$|\|\s*\d+\s+of\s+\d+)/;

const newSnapshot = () => ({ names: new Set<string>(), finished: 0 });

interface UseExecutionStatusOptions {
  nodes: Node<NodeData>[];
  onStatusChange?: (status: WorkflowExecutionStatus) => void;
  executionId?: string | null;
}

export const useExecutionStatus = ({
  nodes,
  onStatusChange,
  executionId,
}: UseExecutionStatusOptions) => {
  const [status, setStatus] = useState<WorkflowExecutionStatus>({
    isRunning: false,
    totalNodes: 0,
    completedNodes: 0,
    failedNodes: 0,
    runningNodes: 0,
    nodeStatuses: [],
    overallProgress: 0,
  });

  const [isVisible, setIsVisible] = useState(false);
  const statusRef = useRef(status);
  const progressUpdateInterval = useRef<NodeJS.Timeout | undefined>(undefined);
  const runtimeTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  // Nextflow prints a snapshot of its processes after each "executor >"
  // line: what the current one has listed so far.
  const snapshot = useRef(newSnapshot());

  // Update ref when status changes
  useEffect(() => {
    statusRef.current = status;
    onStatusChange?.(status);
  }, [status, onStatusChange]);
  void nodes;


  // Start execution tracking
  const startExecution = useCallback(() => {
    // Clear any existing timers
    if (progressUpdateInterval.current) {
      clearInterval(progressUpdateInterval.current);
      progressUpdateInterval.current = undefined;
    }
    if (runtimeTimer.current) {
      clearInterval(runtimeTimer.current);
      runtimeTimer.current = undefined;
    }

    snapshot.current = newSnapshot();
    // DO NOT initialize canvas nodes - only track actual Nextflow processes
    setStatus({
      isRunning: true,
      startTime: new Date(),
      endTime: undefined,
      totalNodes: 0, // Will be populated as Nextflow processes are discovered
      completedNodes: 0,
      failedNodes: 0,
      runningNodes: 0,
      nodeStatuses: [], // Start empty - only populate from Nextflow output
      currentStage: "Starting workflow execution...",
      overallProgress: 0,
    });

    setIsVisible(true);

    // Start runtime timer to update execution time every second
    runtimeTimer.current = setInterval(() => {
      setStatus((prevStatus) => {
        if (!prevStatus.isRunning || !prevStatus.startTime) return prevStatus;
        // Only update if we have been running for at least 1 second to avoid backwards time
        const now = new Date();
        const elapsed = Math.floor(
          (now.getTime() - prevStatus.startTime.getTime()) / 1000
        );
        if (elapsed >= 1) {
          // Force a re-render to update the runtime display
          return { ...prevStatus, lastUpdate: now };
        }
        return prevStatus;
      });
    }, 1000);
  }, []);

  // Parse Nextflow output to update status
  const parseNextflowOutput = useCallback((output: string) => {
    const lines = output.split("\n");

    for (const line of lines) {
      // Parse workflow launch
      if (line.includes("Launching") && line.includes("DSL2")) {
        const launchMatch = line.match(/Launching `([^`]+)`.*\[([^\]]+)\]/);
        if (launchMatch) {
          setStatus((prevStatus) => ({
            ...prevStatus,
            currentStage: `Started: ${launchMatch[1]} [${launchMatch[2]}]`,
          }));
        }
      }

      // How many processes the run has: each snapshot lists every process
      // with tasks and, if the screen is short, counts the rest as "Plus N
      // more processes waiting for tasks…". The total doesn't shrink, and a
      // snapshot read halfway can only count fewer, so the highest is kept.
      const plain = line.replace(ANSI_CODES, "").trim();
      if (/^executor >/.test(plain)) snapshot.current = newSnapshot();
      const listedMatch = plain.match(PROCESS_LINE);
      const plusMatch = plain.match(/^Plus\s+(\d+)\s+more processes waiting/);
      if (listedMatch || plusMatch) {
        if (listedMatch) {
          // A process listed again starts the next snapshot.
          if (snapshot.current.names.has(listedMatch[1])) {
            snapshot.current = newSnapshot();
          }
          snapshot.current.names.add(listedMatch[1]);
          if (/✔$/.test(plain)) snapshot.current.finished += 1;
        }
        const waiting = plusMatch ? Number.parseInt(plusMatch[1], 10) : 0;
        const listed = snapshot.current.names.size;
        const { finished } = snapshot.current;
        setStatus((prevStatus) => ({
          ...prevStatus,
          totalProcesses: Math.max(
            prevStatus.totalProcesses ?? 0,
            listed + waiting,
          ),
          finishedProcesses: Math.max(
            prevStatus.finishedProcesses ?? 0,
            finished,
          ),
        }));
      }

      // Parse executor info to get total running processes
      const executorMatch = line.match(/executor >\s+(\w+)\s+\((\d+)\)/);
      if (executorMatch) {
        const [, executor, totalRunning] = executorMatch;
        setStatus((prevStatus) => ({
          ...prevStatus,
          currentStage: `Executor: ${executor} (${totalRunning} processes running)`,
        }));
      }

      // Process discovery lines ("[-        ] NAME -") are intentionally
      // ignored: nodes are only updated from execution data below.

      // Parse process execution with progress, e.g.
      // "[86/f75e3e] BAD_STEP (1) | 0 of 2, failed: 1 ✘". Nextflow marks a
      // finished process with ✔ and a failed one with ✘.
      const executionMatch = line.match(
        /\[([\w/]+)\]\s+([^\s]+(?:\s+\([^)]+\))?)\s*\|\s*(\d+)\s+of\s+(\d+)(?:,[^✔✘❌⚠]*)?\s*(✔|✘|❌|⚠)?/
      );

      if (executionMatch) {
        // Groups: task hash, process name, completed, total, status symbol.
        const [, , processNameWithInstance, completed, total, statusSymbol] =
          executionMatch;

        // Extract just the process name (remove instance info)
        const nextflowProcessName = processNameWithInstance
          .split(" ")[0]
          .replace(/…/g, "");
        const completedNum = Number.parseInt(completed, 10);
        const totalNum = Number.parseInt(total, 10);
        const failed = statusSymbol === "✘" || statusSymbol === "❌";
        const processStatus: NodeExecutionStatus["status"] = failed
          ? "error"
          : completedNum === totalNum
            ? "success"
            : "running";

        // Create user-friendly names for display
        const getDisplayName = (nfProcessName: string) => {
          const registryLabel = getExecutionLabelForProcessName(nfProcessName);
          if (registryLabel) return registryLabel;

          if (nfProcessName.includes("filter_node")) return "Filter";
          if (nfProcessName.includes("map_node")) return "Map";
          if (nfProcessName.includes("merge_node")) return "Merge";
          if (
            nfProcessName.includes("save_") &&
            nfProcessName.includes("Output_node")
          )
            return "Display Output";
          return nfProcessName;
        };

        const displayName = getDisplayName(nextflowProcessName);

        setStatus((prevStatus) => {
          const nodeStatuses = [...prevStatus.nodeStatuses];

          // Find existing node by process name (stable ID)
          const existingIndex = nodeStatuses.findIndex(
            (n) => n.nodeId === nextflowProcessName
          );

          if (existingIndex === -1) {
            // Create new Nextflow process node
            const newNodeStatus: NodeExecutionStatus = {
              nodeId: nextflowProcessName, // Use actual Nextflow process name as stable ID
              nodeName: displayName, // Use friendly display name
              status: processStatus,
              startTime: new Date(),
              progress: (completedNum / totalNum) * 100,
            };
            nodeStatuses.push(newNodeStatus);
          } else {
            // Update existing process
            const existingNode = nodeStatuses[existingIndex];
            const newProgress = (completedNum / totalNum) * 100;

            if (
              existingNode.progress !== newProgress ||
              existingNode.status !== processStatus
            ) {
              const updatedNode = { ...existingNode };
              updatedNode.progress = newProgress;
              updatedNode.status = processStatus;

              if (
                updatedNode.status === "success" ||
                updatedNode.status === "error"
              ) {
                updatedNode.endTime = new Date();
              }

              if (!updatedNode.startTime) {
                updatedNode.startTime = new Date();
              }

              nodeStatuses[existingIndex] = updatedNode;
            }
          }

          // Calculate overall statistics
          const runningNodes = nodeStatuses.filter(
            (n) => n.status === "running"
          ).length;
          const completedNodes = nodeStatuses.filter(
            (n) => n.status === "success"
          ).length;
          const failedNodes = nodeStatuses.filter(
            (n) => n.status === "error"
          ).length;
          const totalNodes = nodeStatuses.length;
          const overallProgress =
            totalNodes > 0
              ? ((completedNodes + failedNodes) / totalNodes) * 100
              : 0;

          return {
            ...prevStatus,
            nodeStatuses,
            runningNodes,
            completedNodes,
            failedNodes,
            totalNodes,
            overallProgress,
            currentStage: `${displayName}: ${completedNum}/${totalNum}`,
          };
        });
      }

      // Parse individual task completion
      const taskCompletionMatch = line.match(
        /\[([^\]]+)\]\s+(\w+):([^\s]+)(?:\s+\(([^)]+)\))?\s*✔/
      );
      if (taskCompletionMatch) {
        const [, taskId, , taskName] = taskCompletionMatch;

        setStatus((prevStatus) => ({
          ...prevStatus,
          currentStage: `Completed: ${taskName} [${taskId}]`,
        }));
      }

      // A run is complete when the backend says so, once Nextflow has
      // exited: not on Nextflow's summary lines (Duration:, Succeeded:, …),
      // which any task can print too.
      const completionPatterns = [
        /^Nextflow execution completed successfully$/,
        /^Process completed with exit code:\s*0$/,
      ];

      const isCompleted = completionPatterns.some((pattern) =>
        pattern.test(line.trim())
      );

      if (isCompleted) {
        // Clear runtime timer immediately
        if (runtimeTimer.current) {
          clearInterval(runtimeTimer.current);
          runtimeTimer.current = undefined;
        }

        setStatus((prevStatus) => ({
          ...prevStatus,
          isRunning: false,
          endTime: new Date(),
          overallProgress: 100,
          currentStage: "Nextflow execution completed successfully",
          // Mark any remaining nodes as completed
          nodeStatuses: prevStatus.nodeStatuses.map((node) => ({
            ...node,
            status:
              node.status === "running" || node.status === "waiting"
                ? "success"
                : node.status,
            endTime: node.endTime || new Date(),
            progress:
              node.status === "running" || node.status === "waiting"
                ? 100
                : node.progress,
          })),
          completedNodes: prevStatus.nodeStatuses.length,
          runningNodes: 0,
        }));

        // The panel stays open with the run's outcome until it's closed.

        continue; // Nothing else to parse on a completion line
      }

      // Parse errors
      if (line.includes("ERROR ~")) {
        const errorMatch = line.match(/ERROR ~ (.+)/);
        if (errorMatch) {
          const errorMessage = errorMatch[1];
          setStatus((prevStatus) => ({
            ...prevStatus,
            currentStage: `Error: ${errorMessage}`,
          }));
        }
      }

      // Parse failure messages (case-insensitive to handle backend/Nextflow variants)
      const normalizedLine = line.trim().toLowerCase();
      if (
        normalizedLine.includes("execution cancelled") ||
        normalizedLine.includes("execution failed") ||
        normalizedLine.includes("nextflow execution failed with exit code") ||
        normalizedLine.includes("failed to setup workflow execution") ||
        (normalizedLine.includes("process completed with exit code:") &&
          !normalizedLine.includes("exit code: 0"))
      ) {
        // Clear runtime timer
        if (runtimeTimer.current) {
          clearInterval(runtimeTimer.current);
          runtimeTimer.current = undefined;
        }

        setStatus((prevStatus) => ({
          ...prevStatus,
          isRunning: false,
          endTime: new Date(),
          currentStage: line.trim(),
        }));
      }
    }
  }, []);

  // Complete execution (success or failure)
  const completeExecution = useCallback(
    (success: boolean, errorMessage?: string) => {
      if (progressUpdateInterval.current) {
        clearInterval(progressUpdateInterval.current);
        progressUpdateInterval.current = undefined;
      }
      if (runtimeTimer.current) {
        clearInterval(runtimeTimer.current);
        runtimeTimer.current = undefined;
      }

      setStatus((prevStatus) => {
        // Mark any remaining running nodes as completed or failed
        const updatedNodeStatuses = prevStatus.nodeStatuses.map((node) => {
          if (node.status === "running" || node.status === "waiting") {
            return {
              ...node,
              status: (success
                ? "success"
                : "error") as NodeExecutionStatus["status"],
              endTime: new Date(),
              progress: success ? 100 : node.progress,
              error: success ? undefined : errorMessage || "Execution failed",
            };
          }
          return node;
        });

        const completedNodes = updatedNodeStatuses.filter(
          (n) => n.status === "success"
        ).length;
        const failedNodes = updatedNodeStatuses.filter(
          (n) => n.status === "error"
        ).length;

        return {
          ...prevStatus,
          isRunning: false,
          endTime: new Date(),
          nodeStatuses: updatedNodeStatuses,
          runningNodes: 0,
          completedNodes,
          failedNodes,
          overallProgress: 100,
          currentStage: success
            ? "Nextflow execution completed successfully"
            : "Workflow failed",
        };
      });

      // Clear the node statuses on the canvas after a while; the panel
      // stays open with the outcome until it's closed.
      setTimeout(() => {
        // Trigger callback to clear node statuses on the canvas
        onStatusChange?.({
          isRunning: false,
          totalNodes: 0,
          completedNodes: 0,
          failedNodes: 0,
          runningNodes: 0,
          nodeStatuses: [],
          overallProgress: 0,
        });
      }, 10000); // Hide panel and clear statuses after 5 seconds
    },
    [onStatusChange]
  );

  // Cancel execution
  const cancelExecution = useCallback(async () => {
    if (!executionId) {
      console.warn("No execution ID available for cancellation");
      return;
    }

    try {
      // Import api from the correct location
      const { default: api } = await import("../../api");

      // Call backend to cancel the actual process
      await api.post("/execute/cancel", { executionId });
    } catch (error: unknown) {
      console.error("Error cancelling execution:", error);
      // Still update UI even if backend cancel fails
    }

    // Update UI state
    if (progressUpdateInterval.current) {
      clearInterval(progressUpdateInterval.current);
      progressUpdateInterval.current = undefined;
    }
    if (runtimeTimer.current) {
      clearInterval(runtimeTimer.current);
      runtimeTimer.current = undefined;
    }

    setStatus((prevStatus) => ({
      ...prevStatus,
      isRunning: false,
      endTime: new Date(),
      currentStage: "Workflow cancelled",
      overallProgress:
        prevStatus.totalNodes > 0
          ? (prevStatus.completedNodes / prevStatus.totalNodes) * 100
          : 0,
    }));

    // Clear node statuses immediately
    setTimeout(() => {
      // Trigger callback to clear node statuses on the canvas
      onStatusChange?.({
        isRunning: false,
        totalNodes: 0,
        completedNodes: 0,
        failedNodes: 0,
        runningNodes: 0,
        nodeStatuses: [],
        overallProgress: 0,
      });
    }, 1000); // Clear statuses after 1 second

  }, [executionId, onStatusChange]);

  // Hide status panel
  const hideStatus = useCallback(() => {
    setIsVisible(false);
  }, []);

  // Show status panel
  const showStatus = useCallback(() => {
    setIsVisible(true);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressUpdateInterval.current) {
        clearInterval(progressUpdateInterval.current);
      }
      if (runtimeTimer.current) {
        clearInterval(runtimeTimer.current);
      }
    };
  }, []);

  return {
    status,
    isVisible,
    startExecution,
    completeExecution,
    cancelExecution,
    parseNextflowOutput,
    hideStatus,
    showStatus,
  };
};
