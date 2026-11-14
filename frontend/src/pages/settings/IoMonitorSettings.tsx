import type React from "react";
import { useEffect, useId, useState } from "react";
import { HardDrive, Lock } from "lucide-react";
import { getIoMonitorStatus, type IoMonitorStatus } from "../../api/runs";
import { logActivity } from "../../activity/activityLog";
import { useFeatures } from "../../settings/useFeatures";
import { getApiErrorMessage } from "../../utils/errors";

export const IO_MONITOR_PAPER = "https://arxiv.org/abs/2408.00411";

/**
 * Global Settings → I/O monitor: records every file a run's steps open, read
 * and write, with the eBPF monitor of Witzke et al. Off by default: it runs
 * in a privileged container.
 */
const IoMonitorSettings: React.FC = () => {
  const id = useId();
  const { features, locked, save } = useFeatures();
  const isLocked = locked.includes("ioMonitor");
  const [status, setStatus] = useState<IoMonitorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getIoMonitorStatus().then(
      (next) => !cancelled && setStatus(next),
      (caught: unknown) => !cancelled && setError(getApiErrorMessage(caught, "Could not ask whether the monitor can run here.")),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (on: boolean) => {
    setError(null);
    try {
      const saved = await save({ ...features, ioMonitor: on });
      logActivity("features.changed", { features: saved.features });
    } catch (caught: unknown) {
      setError(getApiErrorMessage(caught, "The I/O monitor could not be switched."));
    }
  };

  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-lg border border-panel-border p-5">
      <h2 id={`${id}-heading`} className="flex items-center gap-2 text-lg font-semibold text-text">
        <HardDrive className="h-5 w-5" aria-hidden />
        I/O monitor
      </h2>
      <p className="mt-1 text-sm text-text-light">
        Records every file a run's steps open, read and write, and when, with the eBPF monitor of
        Witzke et al., "Low-level I/O Monitoring for Scientific Workflows" (
        <a href={IO_MONITOR_PAPER} target="_blank" rel="noreferrer" className="text-nextflow-green hover:underline">
          arXiv:2408.00411
        </a>
        ). Each step's <strong>Results</strong> then shows how it read and wrote its files. The
        monitor runs next to each run in a <strong>privileged</strong> container that can see every
        process on this computer, so it is off until you switch it on. Its logs stay in the run's
        folder.
      </p>

      <label className="mt-3 flex items-start gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={features.ioMonitor}
          disabled={isLocked}
          onChange={(event) => void toggle(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-nextflow-green disabled:cursor-not-allowed"
        />
        <span>
          <span className="font-medium">Monitor file accesses during runs</span>
          {isLocked && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-text-light">
              <Lock className="h-3 w-3" aria-hidden />
              Fixed by this installation
            </span>
          )}
          <span className="block text-xs text-text-light">For every run on this N-WAVE.</span>
        </span>
      </label>

      <p aria-live="polite" className="mt-3 text-sm" data-testid="io-monitor-status">
        {status === null && !error ? (
          <span className="text-text-light">Checking whether the monitor can run here…</span>
        ) : status?.available ? (
          <span className="text-text">
            It can run here: Docker on {status.system ?? "this computer"}, kernel {status.kernel ?? "unknown"}. Whether
            the kernel lets it load its probes shows with the first run.
          </span>
        ) : status ? (
          <span className="text-text">It can't run here: {status.reason}</span>
        ) : null}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
};

export default IoMonitorSettings;
