import { notify } from "./notifications";

/** "1 h 4 min", "3 min", "40 s". */
export const formatDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

export interface EndedRun {
  runId: string | null;
  workflowId?: string;
  workflowName?: string;
  outcome: "succeeded" | "failed" | "cancelled";
  durationMs?: number;
  /** Why it failed, in a few words (the failure explanation's title). */
  reason?: string;
}

/** The page a click on a run's notification opens: the workflow with that run. */
export const runPath = (workflowId: string | undefined, runId: string | null): string =>
  workflowId
    ? `/workflow/${encodeURIComponent(workflowId)}${runId ? `?run=${encodeURIComponent(runId)}` : ""}`
    : "/";

/** Notify that a run ended (see notify for when it is shown). */
export const notifyRunEnded = (run: EndedRun): boolean => {
  const name = run.workflowName?.trim() || "A workflow";
  const took = run.durationMs === undefined ? "" : ` after ${formatDuration(run.durationMs)}`;
  const content =
    run.outcome === "succeeded"
      ? {
          title: `${name} finished`,
          body: `The run succeeded${took}. Click to see its results.`,
        }
      : run.outcome === "cancelled"
        ? { title: `${name} was stopped`, body: `The run was stopped${took}.` }
        : {
            title: `${name} failed`,
            body: `${run.reason ? `${run.reason}.` : "The run failed."} Click to see what went wrong.`,
          };
  return notify(run.outcome === "succeeded" ? "runSucceeded" : "runFailed", {
    ...content,
    // One notification per run, however many tabs saw it end.
    tag: `run-${run.runId ?? `${run.workflowId ?? "unsaved"}-${Date.now()}`}`,
    path: runPath(run.workflowId, run.runId),
  });
};
