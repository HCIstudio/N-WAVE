// Every workflow's runs, for the home page: the last run of each workflow
// (shown on its card) and the runs going on now (which can all be stopped).

import { useCallback, useEffect, useMemo, useState } from "react";
import { isDemoMode } from "../../api";
import { cancelRun, listRuns, type RunSummary } from "../../api/runs";

/** How often the runs are read again while some go on. */
const RUNNING_REFRESH_MS = 5000;

export const useRunsOverview = () => {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((count) => count + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload reads them again.
  useEffect(() => {
    // The demo runs nothing.
    if (isDemoMode) return;
    let cancelled = false;
    listRuns(undefined, 100).then(
      (list) => !cancelled && setRuns(Array.isArray(list) ? list : []),
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
