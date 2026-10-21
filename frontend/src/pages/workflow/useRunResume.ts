// Resuming runs: whether the workflow has a cache from earlier runs, the
// Resume choice next to Run (on by default after a failed or cancelled run),
// and clearing the cache.

import { useCallback, useEffect, useState } from "react";
import {
  clearWorkflowCache,
  getWorkflowCache,
  listRuns,
  type WorkflowCache,
} from "../../api/runs";
import { getApiErrorMessage } from "../../utils/errors";

interface Options {
  /** The saved workflow (runs of unsaved ones aren't kept together). */
  workflowId: string | undefined;
  /** Off in the in-browser demo, which keeps no cache. */
  enabled: boolean;
  isRunning: boolean;
}

/** Whether a run that ended this way is best resumed. */
export const resumesAfter = (status: string | undefined): boolean =>
  status === "failed" || status === "cancelled";

export const useRunResume = ({ workflowId, enabled, isRunning }: Options) => {
  const [cache, setCache] = useState<WorkflowCache | null>(null);
  const [resume, setResume] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !workflowId) {
      setCache(null);
      return;
    }
    try {
      const [nextCache, [lastRun]] = await Promise.all([
        getWorkflowCache(workflowId),
        listRuns(workflowId, 1),
      ]);
      setCache(nextCache);
      setResume(nextCache.folders > 0 && resumesAfter(lastRun?.status));
    } catch {
      // An older backend without the cache API: no Resume choice.
      setCache(null);
    }
  }, [enabled, workflowId]);

  // On opening the workflow, and each time a run ends.
  useEffect(() => {
    if (!isRunning) void refresh();
  }, [isRunning, refresh]);

  const clear = useCallback(async () => {
    if (!workflowId) return;
    setIsClearing(true);
    setError(null);
    try {
      setCache(await clearWorkflowCache(workflowId));
      setResume(false);
    } catch (caught: unknown) {
      setError(getApiErrorMessage(caught, "The cache could not be cleared."));
    } finally {
      setIsClearing(false);
    }
  }, [workflowId]);

  const available = Boolean(cache && cache.folders > 0);
  return {
    cache,
    /** There is a cache to resume from. */
    available,
    /** The next run resumes. */
    resume: available && resume,
    setResume,
    clear,
    isClearing,
    error,
  };
};
