// Resuming runs: whether the workflow has a cache from earlier runs, the
// Resume choice next to Run (on by default after a failed or cancelled run,
// or as the Settings page says), and clearing the cache.

import { useCallback, useEffect, useState } from "react";
import {
  clearWorkflowCache,
  getWorkflowCache,
  listRuns,
  type WorkflowCache,
} from "../../api/runs";
import type { ResumeMode } from "../../api/settings";
import { getApiErrorMessage, getResponseStatus } from "../../utils/errors";
import { useFeature } from "../../settings/useFeatures";

interface Options {
  /** The saved workflow (runs of unsaved ones aren't kept together). */
  workflowId: string | undefined;
  /** Off in the in-browser demo, which keeps no cache. */
  enabled: boolean;
  isRunning: boolean;
  /** When Resume starts out on (the Settings page). */
  mode?: ResumeMode;
}

/** How long to wait before asking a restarting N-WAVE again. */
const RETRY_MS = 3000;

/** Whether a run that ended this way is best resumed. */
export const resumesAfter = (status: string | undefined): boolean =>
  status === "failed" || status === "cancelled";

/** Whether Resume starts out on, for a workflow with a cache. */
export const resumesByDefault = (mode: ResumeMode, lastStatus: string | undefined): boolean =>
  mode === "always" || (mode === "after-failure" && resumesAfter(lastStatus));

export const useRunResume = ({
  workflowId,
  enabled,
  isRunning,
  mode = "after-failure",
}: Options) => {
  // Global Settings → Features: without Resume, every run starts from scratch.
  const resumeOn = useFeature("resume");
  const offered = enabled && resumeOn;
  const [cache, setCache] = useState<WorkflowCache | null>(null);
  const [resume, setResume] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  // Set when N-WAVE didn't answer (restarting): ask again a bit later.
  const [retry, setRetry] = useState(0);

  const refresh = useCallback(async () => {
    if (!offered || !workflowId) {
      setCache(null);
      return;
    }
    try {
      const [nextCache, [lastRun]] = await Promise.all([
        getWorkflowCache(workflowId),
        listRuns(workflowId, 1),
      ]);
      setCache(nextCache);
      setResume(nextCache.folders > 0 && resumesByDefault(mode, lastRun?.status));
    } catch (caught: unknown) {
      // An older backend without the cache API: no Resume choice. One that
      // doesn't answer (restarting) keeps what was known.
      const status = getResponseStatus(caught);
      if (status && status < 500) setCache(null);
      else window.setTimeout(() => setRetry((count) => count + 1), RETRY_MS);
    }
  }, [offered, workflowId, mode]);

  // On opening the workflow, each time a run ends, and again while N-WAVE
  // doesn't answer (a run that ended because it shut down).
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry asks again.
  useEffect(() => {
    if (!isRunning) void refresh();
  }, [isRunning, refresh, retry]);

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
