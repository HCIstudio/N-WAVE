// Every workflow's runs, for the home page: the last run of each workflow
// (shown on its card) and the runs going on now (which can all be stopped).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isDemoMode } from "../../api";
import { cancelRun, listRuns, type RunSummary } from "../../api/runs";
import { notifyRunEnded } from "../../notifications/runNotifications";

/** How often the runs are read again while some go on. */
const RUNNING_REFRESH_MS = 5000;

/** Notify about the runs that were going on and have ended since. */
export const notifyEndedRuns = (runs: RunSummary[], wereRunning: Set<string>): void => {
  for (const run of runs) {
    if (!wereRunning.has(run.id) || run.status === "running") continue;
    const started = Date.parse(run.startedAt);
    const finished = run.finishedAt ? Date.parse(run.finishedAt) : Number.NaN;
    notifyRunEnded({
      runId: run.id,
      workflowId: run.workflowId,
      workflowName: run.workflowName,
      outcome:
        run.status === "succeeded" ? "succeeded" : run.status === "cancelled" ? "cancelled" : "failed",
      ...(Number.isFinite(started) && Number.isFinite(finished)
        ? { durationMs: finished - started }
        : {}),
      ...(run.message ? { reason: run.message } : {}),
    });
  }
};

export const useRunsOverview = () => {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((count) => count + 1), []);
  // The runs seen going on, to notice when one ends.
  const wereRunning = useRef(new Set<string>());

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload reads them again.
  useEffect(() => {
    // The demo runs nothing.
    if (isDemoMode) return;
    let cancelled = false;
    listRuns(undefined, 100).then(
      (list) => {
        if (cancelled || !Array.isArray(list)) return;
        notifyEndedRuns(list, wereRunning.current);
        wereRunning.current = new Set(
          list.filter((run) => run.status === "running").map((run) => run.id),
        );
        setRuns(list);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const running = useMemo(() => runs.filter((run) => run.status === "running"), [runs]);

  useEffect(() => {
    if (running.length === 0) return;
    const timer = window.setInterval(refresh, RUNNING_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [running.length, refresh]);

  /** The newest run of each workflow, by its id. */
  const lastRuns = useMemo(() => {
    const byWorkflow = new Map<string, RunSummary>();
    for (const run of runs) {
      if (run.workflowId && !byWorkflow.has(run.workflowId)) byWorkflow.set(run.workflowId, run);
    }
    return byWorkflow;
  }, [runs]);

  /** Stop every run going on; the ones that couldn't be stopped are named. */
  const stopAll = useCallback(async (): Promise<string[]> => {
    const results = await Promise.allSettled(running.map((run) => cancelRun(run.id)));
    refresh();
    return running
      .filter((_, index) => results[index].status === "rejected")
      .map((run) => run.workflowName ?? run.id);
  }, [running, refresh]);

  return { runs, running, lastRuns, refresh, stopAll, enabled: !isDemoMode };
};
