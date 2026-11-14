import type React from "react";
import { useEffect, useState } from "react";
import { getRunTrace, type TraceTask } from "../../../api/runs";
import type { NodeRunSummary } from "../../../execution/nodeRuns";
import { describeIo, summarizeTrace } from "../../../execution/traceSummary";
import { formatDuration } from "../../../notifications/runNotifications";
import { useFeature } from "../../../settings/useFeatures";
import { formatBytes } from "../../../utils/fileContent";

/**
 * The step's tasks in the run's trace, summed up in one line: "4 tasks,
 * 3 min, peak 6.1 GB, read 2.3 GB, wrote 1.1 GB". Nextflow writes a task to
 * the trace when it ends, so the line grows while the step runs.
 */
export const describeNodeTrace = (tasks: TraceTask[]): string | null => {
  if (tasks.length === 0) return null;
  const summary = summarizeTrace(tasks);
  const ran = summary.tasks - summary.cached;
  const peak = summary.processes.reduce<number | null>(
    (most, entry) => (entry.peakRss === null ? most : Math.max(most ?? 0, entry.peakRss)),
    null,
  );
  const time = summary.processes.reduce((sum, entry) => sum + entry.totalRealtime, 0);
  return [
    `${summary.tasks} task${summary.tasks === 1 ? "" : "s"}${summary.cached ? ` (${summary.cached} cached)` : ""}`,
    ran > 0 ? (time < 1000 ? "< 1 s" : formatDuration(time)) : null,
    peak ? `peak ${formatBytes(peak)}` : null,
    ran > 0 ? describeIo(summary.io, formatBytes) : null,
  ]
    .filter(Boolean)
    .join(", ");
};

/** The trace's line for a node, once the run's trace has its tasks. */
const NodeTraceLine: React.FC<{ runId: string; summary: NodeRunSummary }> = ({ runId, summary }) => {
  const performanceOn = useFeature("performance");
  const [line, setLine] = useState<string | null>(null);
  const hashes = summary.tasks.map((task) => task.hash).join(" ");
  // Read again as tasks finish: the trace gets a row for each.
  // biome-ignore lint/correctness/useExhaustiveDependencies: summary.done is the reload signal.
  useEffect(() => {
    if (!performanceOn) return;
    let cancelled = false;
    const own = new Set(hashes.split(" "));
    getRunTrace(runId).then(
      (tasks) => !cancelled && setLine(describeNodeTrace(tasks.filter((task) => own.has(task.hash)))),
      () => !cancelled && setLine(null),
    );
    return () => {
      cancelled = true;
    };
  }, [runId, hashes, summary.done, performanceOn]);
  if (!performanceOn || !line) return null;
  return (
    <p className="text-sm text-text" data-testid="node-trace-line">
      {line}
    </p>
  );
};

export default NodeTraceLine;
