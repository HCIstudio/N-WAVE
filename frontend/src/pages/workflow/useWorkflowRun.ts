// Running the workflow: starting a run, following its streamed output,
// cancelling it, and what the run panel and error notice show about it. A
// run this page didn't start, or whose stream broke, is followed through its
// log until it ends.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import api, { isDemoMode } from "../../api";
import { listRuns, readRunLogFrom } from "../../api/runs";
import type { ToastType } from "../../components/common";
import type { RunPanelTab } from "../../components/common/workflow/ExecutionStatusPanel";
import type { NodeData } from "../../components/nodes/BaseNode";
import { useExecutionStatus, useLatestRef } from "../../hooks";
import { buildPipelineLaunch } from "../../registry/pipelines/launch";
import type { ExecutionSettings } from "../../types/execution";
import {
  getApiErrorMessage,
  getResponseData,
  getResponseStatus,
} from "../../utils/errors";
import { createLineReader, parseRunId } from "../../utils/streamLines";
import { explainFailure } from "../../execution/failureExplanations";
import { currentFeatures } from "../../settings/useFeatures";
import { type EndedRun, notifyRunEnded } from "../../notifications/runNotifications";
import {
  buildRunRequest,
  findRunProblem,
  readRecordedOutcome,
  readRunOutcome,
  type RunOutcome,
  runIdFromOutput,
} from "./runRequest";

/** The log updates at most this often while a run streams. */
const LOG_REFRESH_MS = 250;
/** How often a followed run's log is read. */
const FOLLOW_INTERVAL_MS = 1000;
/** How often N-WAVE is asked again while it doesn't answer. */
const RECONNECT_INTERVAL_MS = 3000;

const WAITING_NOTE =
  "\nN-WAVE: N-WAVE doesn't answer (it may be restarting). Waiting for it, to show how the run went on…\n";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * N-WAVE didn't answer: the network dropped, or it is down or restarting
 * (then the proxy in front of it answers with a server error: nginx 502,
 * Vite's dev server 500).
 */
const isUnreachable = (caught: unknown): boolean => {
  if ((caught as { isAxiosError?: boolean } | null)?.isAxiosError !== true) return false;
  const status = getResponseStatus(caught);
  return !status || status >= 500;
};

export interface RunError {
  message: string;
  output?: string;
  code?: string | number;
  /** N-WAVE knows why it ended (it shut down, or was interrupted): no guesses. */
  known?: boolean;
}

interface Options {
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflowId: string | undefined;
  workflowName: string;
  rawSource: string | null;
  sourceFormat: "visual" | "nextflow";
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
  // The run panel stays on the page as a small Runs bar until a run starts
  // or it is expanded.
  const [panelMinimized, setPanelMinimized] = useState(true);
  const [error, setError] = useState<RunError | null>(null);

  const executionStatus = useExecutionStatus({
    nodes,
    executionId: currentExecutionId,
  });
  // The run this page follows through its log, if any; set `stopped` to end it.
  const following = useRef<{ stopped: boolean } | null>(null);
  const latest = useLatestRef({
    nodes,
    edges,
    isRunning,
    executionStatus,
    workflowId,
    workflowName,
  });
  // When the run this page started began, for how long it took (unknown for
  // a run started elsewhere).
  const runStartedAt = useRef<number | null>(null);

  /** Tell the person in another tab that the run ended (if they want that). */
  const notifyEnded = (runId: string | null, outcome: EndedRun["outcome"], reason?: string) => {
    const startedAt = runStartedAt.current;
    runStartedAt.current = null;
    notifyRunEnded({
      runId,
      workflowId: latest.current.workflowId,
      workflowName: latest.current.workflowName,
      outcome,
      ...(startedAt === null ? {} : { durationMs: Date.now() - startedAt }),
      ...(reason ? { reason } : {}),
    });
  };

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

  const finish = (
    text: string,
    launchNodeId: string | undefined,
    outcome: RunOutcome = readRunOutcome(text),
  ) => {
    pendingOutput.current = null;
    setOutput(text);
    setCurrentExecutionId(null);

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
    notifyEnded(
      runId ?? null,
      outcome.kind,
      outcome.kind === "failed"
        ? outcome.resourceProblem
          ? "It hit its resource limits"
          : (outcome.reason ??
            (currentFeatures().failureExplanations ? explainFailure(text)?.title : undefined))
        : undefined,
    );
    if (outcome.kind === "cancelled") return;

    const failed = outcome.kind === "failed";
    executionStatus.completeExecution(!failed, failed ? text : undefined);
    if (!failed) {
      showToast(
        "Workflow executed successfully. Its results are listed in the run panel.",
        "success",
      );
      setError(null);
      return;
    }
    // A failed run gets the error notice (with Show log and Retry) instead
    // of a toast saying the same.
    setError({
      message: outcome.resourceProblem
        ? `The run hit its resource limits. ${outcome.resourceProblem}`
        : (outcome.reason ?? "Workflow execution failed"),
      output: text,
      known: Boolean(outcome.reason),
    });
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
    notifyEnded(typeof data?.runId === "string" ? data.runId : null, "failed", message);
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

  /**
   * Follow a run through its log until it ends: one this page didn't start
   * (the workflow was reopened while it ran), or one whose stream broke (the
   * connection dropped, or N-WAVE restarted). While N-WAVE doesn't answer,
   * it waits for it. `fresh` starts the progress over (a reopened page).
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: finish, fail and queueOutput only set state.
  const follow = useCallback(async (runId: string, fresh: boolean) => {
    if (following.current) following.current.stopped = true;
    const token = { stopped: false };
    following.current = token;
    setIsRunning(true);
    setCurrentExecutionId(runId);
    setLastRunId(runId);
    if (fresh) {
      runStartedAt.current = null;
      latest.current.executionStatus.startExecution();
      setOutput("");
      setPanelMinimized(false);
    }
    const lineReader = createLineReader((line) =>
      latest.current.executionStatus.parseNextflowOutput(line),
    );
    let text = "";
    let offset = 0;
    let waiting = false;
    try {
      while (!token.stopped) {
        try {
          const chunk = await readRunLogFrom(runId, offset);
          waiting = false;
          text += chunk.text;
          offset = chunk.end;
          lineReader.feed(text);
          queueOutput(text);
          if (!chunk.live) break;
        } catch (caught: unknown) {
          if (getResponseStatus(caught) === 404) break;
          if (!isUnreachable(caught)) throw caught;
          if (!waiting) queueOutput(`${text}${WAITING_NOTE}`);
          waiting = true;
        }
        await sleep(waiting ? RECONNECT_INTERVAL_MS : FOLLOW_INTERVAL_MS);
      }
      if (token.stopped) return;
      lineReader.flush(text);
      // Its recorded status says how it ended (the log may stop short,
      // e.g. when N-WAVE was killed while it ran).
      const recorded = (await listRuns(workflowId, 20).catch(() => [])).find(
        (candidate) => candidate.id === runId,
      );
      const launch = buildPipelineLaunch(latest.current.nodes, latest.current.edges);
      finish(text, launch?.nodeId, readRecordedOutcome(text, recorded));
    } catch (caught: unknown) {
      if (!token.stopped) fail(caught);
    } finally {
      if (following.current === token) {
        following.current = null;
        setIsRunning(false);
        setCurrentExecutionId(null);
      }
    }
  }, [workflowId, latest]);

  // Reopening the workflow while one of its runs goes on shows that run.
  useEffect(() => {
    if (isDemoMode || !workflowId) return;
    let cancelled = false;
    void listRuns(workflowId, 5)
      .then((runs) => {
        const live = runs.find((candidate) => candidate.status === "running");
        if (!cancelled && live && !latest.current.isRunning) void follow(live.id, true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workflowId, follow, latest]);

  // Leaving the page stops following (the run goes on on the server).
  useEffect(
    () => () => {
      if (following.current) following.current.stopped = true;
    },
    [],
  );

  const run = async (settings: ExecutionSettings, options: { resume?: boolean } = {}) => {
    // The run's id once the server started it (the stream's first line).
    let startedRunId: string | null = null;
    // Set when the stream broke and the run is followed through its log.
    let handedOver = false;
    setIsRunning(true);
    runStartedAt.current = Date.now();
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
        resume: options.resume,
      });

      setLastRunId(null);
      setOutput("");
      startedRunId = null;
      // The output is read while the run goes: progress updates live, and
      // the run id (first line) makes Cancel work for long runs.
      const lineReader = createLineReader((line) => {
        const runId = parseRunId(line);
        if (runId) {
          startedRunId = runId;
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
      if (startedRunId && isUnreachable(caught)) {
        // The run may well go on (or was stopped by a restart): find out
        // from its log once N-WAVE answers, instead of starting it again.
        handedOver = true;
        void follow(startedRunId, false);
      } else {
        fail(caught);
      }
    } finally {
      if (!handedOver) {
        setIsRunning(false);
        setCurrentExecutionId(null);
      }
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
