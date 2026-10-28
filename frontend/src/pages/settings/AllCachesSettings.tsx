import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { HardDrive, Trash2 } from "lucide-react";
import type { WorkflowCache } from "../../api/runs";
import { clearAllCaches, getAllCaches } from "../../api/settings";
import { getApiErrorMessage } from "../../utils/errors";
import { formatBytes } from "../../utils/fileContent";

/** The Settings page's run cache: how much all workflows' runs keep, and clearing it. */
const AllCachesSettings: React.FC = () => {
  const [cache, setCache] = useState<WorkflowCache | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    getAllCaches().then(setCache, (caught: unknown) =>
      setMessage({ ok: false, text: getApiErrorMessage(caught, "The cache size could not be read.") }),
    );
  }, []);
  useEffect(load, [load]);

  const clear = async () => {
    setConfirming(false);
    setClearing(true);
    setMessage(null);
    try {
      const { skipped, ...rest } = await clearAllCaches();
      setCache(rest);
      setMessage({
        ok: true,
        text:
          skipped > 0
            ? `Cleared, except ${skipped} run folder${skipped === 1 ? "" : "s"} a run still uses.`
            : "Cleared. The next runs run every step.",
      });
    } catch (caught: unknown) {
      setMessage({ ok: false, text: getApiErrorMessage(caught, "The cache could not be cleared.") });
    } finally {
      setClearing(false);
    }
  };

  const hasCache = Boolean(cache && cache.folders > 0);
  return (
    <section aria-label="Run cache" className="rounded-lg border border-panel-border p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text">
        <HardDrive className="h-5 w-5" aria-hidden />
        Run cache
      </h2>
      <p className="mt-1 text-sm text-text-light">
        Runs keep each step's work folder so Resume can reuse it. This is the cache of all
        workflows; a workflow's own is in its Execution Settings.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text" data-testid="all-caches-size">
          {cache === null
            ? "Reading…"
            : hasCache
              ? `${formatBytes(cache.bytes)} in ${cache.folders} run folder${cache.folders === 1 ? "" : "s"}`
              : "Empty."}
        </p>
        {confirming ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text">Every workflow runs every step again next time?</span>
            <button
              type="button"
              onClick={() => void clear()}
              className="rounded-md bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
            >
              Clear all
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
            disabled={!hasCache || clearing}
            className="inline-flex items-center gap-1.5 rounded-md border border-panel-border px-3 py-1.5 text-sm text-text hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {clearing ? "Clearing…" : "Clear all caches"}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-text-light">Results, inputs and logs of earlier runs stay.</p>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`mt-2 text-sm ${message.ok ? "text-text-light" : "text-red-500"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
};

export default AllCachesSettings;
