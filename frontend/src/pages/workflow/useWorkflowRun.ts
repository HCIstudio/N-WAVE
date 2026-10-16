// Running the workflow: starting a run, following its streamed output,
// cancelling it, and what the run panel and error notice show about it.

import { useCallback, useRef, useState } from "react";
import type { Edge, Node } from "reactflow";
import api from "../../api";
import type { ToastType } from "../../components/common";
import type { RunPanelTab } from "../../components/common/workflow/ExecutionStatusPanel";
import type { NodeData } from "../../components/nodes/BaseNode";
import { useExecutionStatus } from "../../hooks";
import { buildPipelineLaunch } from "../../registry/pipelines/launch";
import type { ExecutionSettings } from "../../types/execution";
import {
  getApiErrorMessage,
  getResponseData,
  getResponseStatus,
} from "../../utils/errors";
import { createLineReader, parseRunId } from "../../utils/streamLines";
import {
  buildRunRequest,
  findRunProblem,
  readRunOutcome,
  runIdFromOutput,
} from "./runRequest";

/** The log updates at most this often while a run streams. */
const LOG_REFRESH_MS = 250;

export interface RunError {
  message: string;
  output?: string;
  code?: string | number;
}

interface Options {
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflowId: string | undefined;
  workflowName: string;
  rawSource: string | null;
  sourceFormat: "visual" | "nextflow";
  /** Keeps the settings a run used as the workflow's settings. */
  setExecutionSettings: (settings: ExecutionSettings) => void;
  updateNodeData: (nodeId: string, data: Partial<NodeData>) => void;
  showToast: (message: string, type: ToastType) => void;
}

export const useWorkflowRun = ({
  nodes,
  edges,
  workflowId,
  workflowName,
  rawSource,
  sourceFormat,
  setExecutionSettings,
  updateNodeData,
  showToast,
}: Options) => {
  const [isRunning, setIsRunning] = useState(false);
  // The last run's id, kept after it ends to link its results.
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  // Set while a run can be cancelled.
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(
    null,
  );
  // The current run's output, for the run panel's Log tab.
  const [output, setOutput] = useState("");
  const pendingOutput = useRef<string | null>(null);
  const [panelTab, setPanelTab] = useState<RunPanelTab>("steps");
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [error, setError] = useState<RunError | null>(null);

  const executionStatus = useExecutionStatus({
    nodes,
    executionId: currentExecutionId,
  });

  // The Run button (while running), Show runs and Show full log all bring
  // the run panel back, expanded.
  const openPanel = useCallback(() => {
    setPanelMinimized(false);
    executionStatus.showStatus();
  }, [executionStatus.showStatus]);

  const showLog = useCallback(() => {
    setError(null);
    setPanelTab("log");
    openPanel();
  }, [openPanel]);

  /** Show the log as it streams, a few times a second at most. */
  const queueOutput = (text: string) => {
    if (pendingOutput.current === null) {
      setTimeout(() => {
        if (pendingOutput.current !== null) setOutput(pendingOutput.current);
        pendingOutput.current = null;
      }, LOG_REFRESH_MS);
    }
    pendingOutput.current = text;
  };

  const finish = (text: string, launchNodeId: string | undefined) => {
    pendingOutput.current = null;
    setOutput(text);
    setCurrentExecutionId(null);

    const outcome = readRunOutcome(text);
    // Remember the run on the Pipeline node, to show its reports.
    const runId = runIdFromOutput(text);
    if (launchNodeId && runId) {
      updateNodeData(launchNodeId, {
        pipelineLastRun: {
          id: runId,
          finishedAt: new Date().toISOString(),
          success: outcome.kind !== "failed",
        },
      });
    }
    if (outcome.kind === "cancelled") return;

    const failed = outcome.kind === "failed";
    executionStatus.completeExecution(!failed, failed ? text : undefined);
    showToast(
      !failed
        ? "Workflow executed successfully! Results have been written to ~/results. \nCheck the execution panel for details."
        : outcome.resourceProblem
          ? `The run hit its resource limits: ${outcome.resourceProblem}`
          : "Workflow execution failed. Check the execution panel/log output for details.",
      failed ? "error" : "success",
    );
    // A failed run also gets the error notice, with Show log and Retry.
    setError(
      failed
        ? {
            message: outcome.resourceProblem
              ? `The run hit its resource limits. ${outcome.resourceProblem}`
              : "Workflow execution failed",
            output: text,
          }
        : null,
    );
  };

  const fail = (caught: unknown) => {
    console.error("Workflow execution failed:", caught);
    const data = getResponseData(caught);
    // The execute endpoint reports the specific problem in `error`.
    const message =
      typeof data?.error === "string" && data.error
        ? data.error
        : getApiErrorMessage(
            caught,
            "Unknown error occurred during workflow execution",
          );
    const failureOutput = String(data?.stdout || data?.stderr || "");
    if (typeof data?.runId === "string") setLastRunId(data.runId);
    pendingOutput.current = null;
    // Keep what streamed before the failure and add why it failed.
    setOutput((previous) =>
      [previous.trimEnd(), failureOutput, `Error: ${message}`]
        .filter(Boolean)
        .join("\n"),
    );
    executionStatus.completeExecution(false, message);
    setError({
      message,
      output: failureOutput,
      code:
        getResponseStatus(caught) ??
        (caught as { code?: string | number } | undefined)?.code,
    });
  };

  const run = async (settings: ExecutionSettings) => {
    setIsRunning(true);
    setExecutionSettings(settings);
    executionStatus.startExecution();
    setPanelMinimized(false);
    try {
      const problem = findRunProblem(nodes, edges);
      if (problem) throw new Error(problem);
      // A Pipeline node runs a whole nf-core pipeline instead of a script.
      const launch = buildPipelineLaunch(nodes, edges);
      const body = buildRunRequest({
        nodes,
        edges,
        workflowId,
        workflowName,
        settings,
        launch,
        rawSource,
        sourceFormat,
      });

      setLastRunId(null);
      setOutput("");
      // The output is read while the run goes: progress updates live, and
      // the run id (first line) makes Cancel work for long runs.
      const lineReader = createLineReader((line) => {
        const runId = parseRunId(line);
        if (runId) {
          setCurrentExecutionId(runId);
          setLastRunId(runId);
        }
        executionStatus.parseNextflowOutput(line);
      });

      const response = await api.post<string>("/execute/execute", body, {
        responseType: "text",
        transformResponse: [(data) => data],
        // No client-side timeout: runs can take hours.
        timeout: 0,
        onDownloadProgress: (event) => {
          const request = event.event?.target as XMLHttpRequest | undefined;
          if (typeof request?.responseText === "string") {
            lineReader.feed(request.responseText);
            queueOutput(request.responseText);
          }
        },
      });
      const text = String(response.data ?? "");
      // Lines not seen while streaming (e.g. the last one).
      lineReader.flush(text);
      finish(text, launch?.nodeId);
    } catch (caught: unknown) {
      fail(caught);
    } finally {
      setIsRunning(false);
      setCurrentExecutionId(null);
    }
  };

  return {
    isRunning,
    lastRunId,
    canCancel: Boolean(currentExecutionId),
    output,
    executionStatus,
    panelTab,
    setPanelTab,
    panelMinimized,
    setPanelMinimized,
    openPanel,
    showLog,
    error,
    dismissError: () => setError(null),
    run,
  };
};
