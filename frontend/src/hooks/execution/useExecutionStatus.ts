import { useState, useEffect, useCallback, useRef } from "react";
import type { Node } from "reactflow";
import type { NodeData } from "../../components/nodes/BaseNode";
import type {
  WorkflowExecutionStatus,
  NodeExecutionStatus,
} from "../../components/common/workflow/ExecutionStatusPanel";

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
  const progressUpdateInterval = useRef<NodeJS.Timeout>();
  const runtimeTimer = useRef<NodeJS.Timeout>();

  // Update ref when status changes
  useEffect(() => {
    statusRef.current = status;
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  // Initialize node statuses from workflow nodes
  const initializeNodeStatuses = useCallback(() => {
    const processNodes = nodes.filter(
      (node) =>
        node.type === "process" ||
        node.type === "filter" ||
        node.type === "operator" ||
        node.type === "outputDisplay" ||
        node.data.processType === "fastqc"
    );

    console.log(
      `🔍 Canvas nodes found:`,
      processNodes.map((n) => ({
        id: n.id,
        type: n.type,
        label: n.data.label,
      }))
    );

    // Create unique node statuses based on their labels, avoiding duplicates
    const nodeStatusMap = new Map<string, NodeExecutionStatus>();

    processNodes.forEach((node) => {
      const nodeLabel = node.data.label || `${node.type}_${node.id}`;

      // Only add if we don't already have a node with this label
      if (!nodeStatusMap.has(nodeLabel)) {
        nodeStatusMap.set(nodeLabel, {
          nodeId: node.id,
          nodeName: nodeLabel,
          status: "waiting",
          container: node.data.containerImage,
          resources: node.data.cpus
            ? {
                cpus: node.data.cpus || 1,
                memory: node.data.memory || "2.GB",
              }
            : undefined,
        });
      }
    });

    const nodeStatuses = Array.from(nodeStatusMap.values());
    console.log(
      `🔢 Initialized ${nodeStatuses.length} unique nodes for tracking:`,
      nodeStatuses.map((n) => n.nodeName)
    );

    return {
      totalNodes: nodeStatuses.length,
      nodeStatuses,
    };
  }, [nodes]);

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

    lines.forEach((line) => {
      // Debug: Log each line to see what we're parsing
      console.log("Parsing line:", JSON.stringify(line));

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

      // Parse executor info to get total running processes
      const executorMatch = line.match(/executor >\s+(\w+)\s+\((\d+)\)/);
      if (executorMatch) {
        const [, executor, totalRunning] = executorMatch;
        setStatus((prevStatus) => ({
          ...prevStatus,
          currentStage: `Executor: ${executor} (${totalRunning} processes running)`,
        }));
      }

      // Parse process discovery phase - processes being listed
      const processListMatch = line.match(/\[-\s+\]\s+([^\s]+)\s+-?$/);
      if (processListMatch) {
        // DO NOT CREATE NODES HERE - only update canvas nodes from execution data
        console.log(
          `🔍 Discovered Nextflow process: ${processListMatch[1]} (will map to canvas node later)`
        );
      }

      // Parse process execution with progress - Main pattern
      const executionMatch = line.match(
        /\[([\w\/]+)\]\s+([^\s]+(?:\s+\([^)]+\))?)\s*\|\s*(\d+)\s+of\s+(\d+)\s*(✔|❌|⚠)?/
      );

      if (executionMatch) {
        const [
          ,
          taskId,
          processNameWithInstance,
          completed,
          total,
          statusSymbol,
        ] = executionMatch;

        // Extract just the process name (remove instance info)
        const nextflowProcessName = processNameWithInstance
          .split(" ")[0]
          .replace(/…/g, "");
        const completedNum = Number.parseInt(completed);
        const totalNum = Number.parseInt(total);

        // Create user-friendly names for display
        const getDisplayName = (nfProcessName: string) => {
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
              status: completedNum === totalNum ? "success" : "running",
              startTime: new Date(),
              progress: (completedNum / totalNum) * 100,
            };
            nodeStatuses.push(newNodeStatus);
            console.log(
              `➕ Created Nextflow process: ${displayName} (${nextflowProcessName})`
            );
          } else {
            // Update existing process
            const existingNode = nodeStatuses[existingIndex];
            const newProgress = (completedNum / totalNum) * 100;

            if (
              existingNode.progress !== newProgress ||
              existingNode.status === "waiting"
            ) {
              const updatedNode = { ...existingNode };
              updatedNode.progress = newProgress;
              updatedNode.status =
                completedNum === totalNum
                  ? statusSymbol === "❌"
                    ? "error"
                    : "success"
                  : "running";

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
              console.log(
                `🔄 Updated Nextflow process: ${displayName} (${newProgress}%)`
              );
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

      // Parse workflow completion - Multiple patterns
      const completionPatterns = [
        /Completed at:.*/,
        /Duration:\s+.*/,
        /CPU hours:\s+.*/,
        /Succeeded:\s+\d+/,
        /Process completed with exit code:\s*0/,
        /Nextflow execution completed successfully/,
        /Pipeline completed successfully/,
      ];

      const isCompleted = completionPatterns.some((pattern) =>
        pattern.test(line)
      );

      if (isCompleted) {
        console.log("🎉 Detected workflow completion:", line);

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

        // Auto-hide after showing completion for a few seconds
        setTimeout(() => {
          setIsVisible(false);
          setStatus({
            isRunning: false,
            totalNodes: 0,
            completedNodes: 0,
            failedNodes: 0,
            runningNodes: 0,
            nodeStatuses: [],
            overallProgress: 0,
          });
        }, 10000);

        return; // Stop processing any more lines after completion
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

      // Parse failure messages
      if (
        line.includes("Execution cancelled") ||
        line.includes("Execution failed") ||
        (line.includes("Process completed with exit code:") &&
          !line.includes("exit code: 0"))
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
    });
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

      // Clear node statuses and hide panel after completion
      setTimeout(() => {
        setIsVisible(false);
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
      const response = await api.post("/execute/cancel", { executionId });

      console.log("Execution cancelled successfully:", response.data);
    } catch (error: any) {
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
        (prevStatus.completedNodes / prevStatus.totalNodes) * 100,
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

    // Auto-hide the panel after a delay
    setTimeout(() => {
      setIsVisible(false);
    }, 10000); // Hide panel after 2 seconds for cancellation
  }, [executionId]);

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
