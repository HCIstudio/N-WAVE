import type React from "react";
import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import type { WorkflowCache } from "../../../api/runs";
import { formatBytes } from "../../../utils/fileContent";

interface RunCacheSettingsProps {
  /** null while unknown, or for a workflow that isn't saved yet. */
  cache: WorkflowCache | null;
  onClear: () => void;
  isClearing?: boolean;
  isRunning?: boolean;
  error?: string | null;
}

/**
 * The execution settings' Run cache section: its size and a way to clear it.
 * Clearing is confirmed in place: a dialog would open behind the settings.
 */
const RunCacheSettings: React.FC<RunCacheSettingsProps> = ({
  cache,
  onClear,
  isClearing = false,
  isRunning = false,
  error = null,
}) => {
  const [confirming, setConfirming] = useState(false);
  const hasCache = Boolean(cache && cache.folders > 0);
  return (
    <section aria-label="Run cache" className="mt-6 rounded-lg border border-panel-border p-4">
      <h3 className="flex items-center gap-2 text-base font-semibold text-text">
        <RotateCcw className="h-4 w-4" aria-hidden />
        Run cache
      </h3>
      <p className="mt-1 text-sm text-text-light">
        Runs keep each step's work folder, so Resume can reuse the steps whose
        code and inputs haven't changed instead of running them again.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text" data-testid="run-cache-size">
          {cache === null
            ? "Save the workflow and run it to start a cache."
            : hasCache
              ? `${formatBytes(cache.bytes)} in ${cache.folders} run folder${cache.folders === 1 ? "" : "s"}`
              : "Empty: the next run runs every step."}
        </p>
        {confirming ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text">Run every step again next time?</span>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onClear();
              }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-panel-border px-3 py-1.5 text-text hover:bg-accent"
            >
              Keep
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!hasCache || isClearing || isRunning}
            title={isRunning ? "Wait for the run to end" : "Delete the cache of this workflow's runs"}
            className="inline-flex items-center gap-1.5 rounded-md border border-panel-border px-3 py-1.5 text-sm text-text hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {isClearing ? "Clearing…" : "Clear cache"}
          </button>
        )}
      </div>
      {confirming && (
        <p className="mt-1 text-xs text-text-light">
          Results, inputs and logs of earlier runs stay.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {error}
        </p>
      )}
    </section>
  );
};

export default RunCacheSettings;
