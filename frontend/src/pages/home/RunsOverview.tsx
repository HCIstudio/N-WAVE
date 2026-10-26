import type React from "react";
import { useState } from "react";
import { Square } from "lucide-react";
import { ConfirmDialog } from "../../components/common";
import RunHistory from "../../components/common/workflow/RunHistory";
import type { RunSummary } from "../../api/runs";

/**
 * The home page's runs: every workflow's runs, newest first, with their
 * logs and results, and a way to stop all that go on.
 */
const RunsOverview: React.FC<{
  runs: RunSummary[];
  running: RunSummary[];
  onStopAll: () => Promise<string[]>;
}> = ({ runs, running, onStopAll }) => {
  const [confirming, setConfirming] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [notStopped, setNotStopped] = useState<string[]>([]);

  const stopAll = async () => {
    setConfirming(false);
    setStopping(true);
    try {
      setNotStopped(await onStopAll());
    } finally {
      setStopping(false);
    }
  };

  return (
    <section aria-labelledby="home-runs" className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="home-runs" className="text-xl font-semibold text-text">
            Runs
          </h2>
          <p className="mt-1 text-sm text-text-light">
            {running.length > 0
              ? `${running.length} going on now. `
              : "None going on now. "}
            Every workflow's runs on this server, newest first: pick one for its log and results.
          </p>
        </div>
        {running.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={stopping}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/60 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-60"
          >
            <Square size={14} aria-hidden />
            {stopping ? "Stopping…" : `Stop all running (${running.length})`}
          </button>
        )}
      </div>
      {notStopped.length > 0 && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          Could not stop: {notStopped.join(", ")}.
        </p>
      )}
      <div className="mt-4 h-[24rem] overflow-hidden rounded-lg border border-gray-600 bg-[#fcfcfc]">
        <RunHistory workflowId={null} everyWorkflow refreshKey={runs} />
      </div>
      <ConfirmDialog
        isOpen={confirming}
        title="Stop all running workflows?"
        message={`This stops ${running.length} run${running.length === 1 ? "" : "s"}: ${running
          .map((run) => run.workflowName ?? run.id)
          .join(", ")}. Each can be resumed later, reusing the steps it finished.`}
        confirmText="Stop all"
        cancelText="Keep them running"
        onConfirm={() => void stopAll()}
        onClose={() => setConfirming(false)}
      />
    </section>
  );
};

export default RunsOverview;
