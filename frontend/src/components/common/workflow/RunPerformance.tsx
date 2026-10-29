import type React from "react";
import { useEffect, useState } from "react";
import { ChartColumn, ChartGantt, ExternalLink } from "lucide-react";
import {
  getRunTrace,
  listRunReports,
  listRunTasks,
  type RunReportKind,
  runReportUrl,
} from "../../../api/runs";
import { MEMORY_WARNING_SHARE, summarizeTrace, type TraceSummary } from "../../../execution/traceSummary";
import { formatDuration } from "../../../notifications/runNotifications";
import { formatBytes } from "../../../utils/fileContent";
import { useFeature } from "../../../settings/useFeatures";

const REPORT_LINKS: { kind: RunReportKind; label: string; icon: React.ReactNode }[] = [
  { kind: "report", label: "Execution report", icon: <ChartColumn className="h-4 w-4" aria-hidden /> },
  { kind: "timeline", label: "Timeline", icon: <ChartGantt className="h-4 w-4" aria-hidden /> },
];

/** Buttons that open the run's Nextflow execution report and timeline in a new tab. */
export const RunReportLinks: React.FC<{ runId: string; reports: Record<RunReportKind, boolean> }> = ({
  runId,
  reports,
}) => {
  const links = REPORT_LINKS.filter((link) => reports[link.kind]);
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <a
          key={link.kind}
          href={runReportUrl(runId, link.kind)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100"
        >
          {link.icon}
          {link.label}
          <ExternalLink className="h-3 w-3 text-gray-500" aria-hidden />
        </a>
      ))}
    </div>
  );
};

/** The report buttons, once it's known which reports the run has. */
export const RunReportButtons: React.FC<{ runId: string }> = ({ runId }) => {
  const [reports, setReports] = useState<Record<RunReportKind, boolean> | null>(null);
  // Global Settings → Features can switch the reports off.
  const performanceOn = useFeature("performance");
  useEffect(() => {
    if (!performanceOn) return;
    let cancelled = false;
    setReports(null);
    listRunReports(runId).then(
      (found) => !cancelled && setReports(found),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [runId, performanceOn]);
  return reports && performanceOn ? <RunReportLinks runId={runId} reports={reports} /> : null;
};

/** A step's time; tasks that ran under a second show as such. */
const taskTime = (ms: number, ran: number): string =>
  ran === 0 ? "–" : ms < 1000 ? "< 1 s" : formatDuration(ms);

/** "189 tasks: 54 cached, 2 retried, 1 failed". */
const taskCounts = (summary: TraceSummary): string => {
  const notes = [
    summary.cached ? `${summary.cached} cached` : null,
    summary.retried ? `${summary.retried} retried` : null,
    summary.failed ? `${summary.failed} failed` : null,
    summary.ignored ? `${summary.ignored} failed but ignored` : null,
  ].filter(Boolean);
  return `${summary.tasks} task${summary.tasks === 1 ? "" : "s"}${notes.length ? `: ${notes.join(", ")}` : ""}`;
};

type State =
  | { status: "loading" }
  | { status: "loaded"; reports: Record<RunReportKind, boolean>; summary: TraceSummary | null }
  | { status: "error" };

/**
 * How a finished run went, from Nextflow's trace: how long it and each step
 * took, the slowest steps, memory use against what steps asked for, and
 * cached, retried and failed tasks. With the execution report and timeline.
 */
const RunPerformance: React.FC<{
  runId: string;
  showLinks?: boolean;
  /** The canvas name of the node that runs a Nextflow process, if any. */
  labelFor?: (process: string) => string | undefined;
}> = ({ runId, showLinks = true, labelFor }) => {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    listRunReports(runId)
      .then(async (reports) => {
        if (!reports.trace) return { reports, summary: null };
        const [trace, tasks] = await Promise.all([
          getRunTrace(runId),
          listRunTasks(runId).catch(() => []),
        ]);
        const ignored = new Set(tasks.filter((task) => task.status === "ignored").map((task) => task.hash));
        return { reports, summary: summarizeTrace(trace, ignored) };
      })
      .then(
        (loaded) => !cancelled && setState({ status: "loaded", ...loaded }),
        () => !cancelled && setState({ status: "error" }),
      );
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (state.status === "loading") {
    return <p className="p-3 text-sm text-gray-700">Reading the run's trace…</p>;
  }
  if (state.status === "error") {
    return (
      <p className="p-3 text-sm text-gray-700">
        This run has no execution report or trace (runs from before N-WAVE kept them, or runs
        that stopped before Nextflow started).
      </p>
    );
  }
  const { reports, summary } = state;
  const span = summary && summary.start !== null && summary.end !== null ? summary.end - summary.start : 0;
  const nearLimit = summary?.processes.filter(
    (entry) => entry.memoryShare !== null && entry.memoryShare >= MEMORY_WARNING_SHARE,
  );

  return (
    <section aria-label="Run performance" className="space-y-3 p-3 text-gray-800">
      {showLinks && <RunReportLinks runId={runId} reports={reports} />}
      {!summary ? (
        <p className="text-sm text-gray-700">This run has no trace to sum up.</p>
      ) : (
        <>
          <p className="text-sm" data-testid="run-performance-summary">
            {summary.wallTime > 0 ? `Took ${formatDuration(summary.wallTime)}` : "No step ran"}
            {summary.cpuHours >= 0.01 ? ` · ${summary.cpuHours.toFixed(2)} CPU hours` : ""} ·{" "}
            {taskCounts(summary)}
          </p>

          {nearLimit && nearLimit.length > 0 && (
            <ul aria-label="Memory hints" className="space-y-1">
              {nearLimit.map((entry) => (
                <li
                  key={entry.process}
                  className="rounded border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-900"
                >
                  <strong>{labelFor?.(entry.process) ?? entry.label}</strong> used {Math.round((entry.memoryShare ?? 0) * 100)}% of
                  the {formatBytes(entry.memory ?? 0)} of memory it had. If it fails with exit
                  status 137, give it more memory (or raise the run's Maximum Memory).
                </li>
              ))}
            </ul>
          )}

          <table aria-label="Steps by time" className="w-full text-left text-xs">
            <thead className="text-gray-600">
              <tr>
                <th className="py-1 pr-2 font-medium">Step</th>
                <th className="py-1 pr-2 font-medium">Tasks</th>
                <th className="py-1 pr-2 font-medium">Time</th>
                <th className="py-1 pr-2 font-medium">Longest task</th>
                <th className="py-1 pr-2 font-medium">Peak memory</th>
                <th className="w-1/3 py-1 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {summary.processes.map((entry) => {
                const left = span && entry.start !== null && summary.start !== null ? ((entry.start - summary.start) / span) * 100 : 0;
                const width =
                  span && entry.start !== null && entry.end !== null
                    ? Math.max(((entry.end - entry.start) / span) * 100, 0.5)
                    : 0;
                const notes = [
                  entry.cached ? `${entry.cached} cached` : null,
                  entry.retried ? `${entry.retried} retried` : null,
                  entry.failed ? `${entry.failed} failed` : null,
                  entry.ignored ? `${entry.ignored} ignored` : null,
                ].filter(Boolean);
                return (
                  <tr key={entry.process} className="border-t border-gray-200 align-top">
                    <td className="py-1 pr-2" title={entry.process}>
                      {labelFor?.(entry.process) ?? <span className="font-mono">{entry.label}</span>}
                    </td>
                    <td className="py-1 pr-2">
                      {entry.tasks}
                      {notes.length > 0 && <span className="block text-gray-600">{notes.join(", ")}</span>}
                    </td>
                    <td className="py-1 pr-2">{taskTime(entry.totalRealtime, entry.tasks - entry.cached)}</td>
                    <td className="py-1 pr-2">{taskTime(entry.longestRealtime, entry.tasks - entry.cached)}</td>
                    <td className="py-1 pr-2">
                      {/* Tasks too short to measure report 0. */}
                      {entry.peakRss ? formatBytes(entry.peakRss) : "–"}
                      {entry.memory ? <span className="text-gray-600"> of {formatBytes(entry.memory)}</span> : null}
                    </td>
                    <td className="py-1">
                      {width > 0 ? (
                        <div className="relative h-3 rounded bg-gray-100" aria-hidden>
                          <div
                            className={`absolute h-3 rounded ${entry.failed ? "bg-red-400" : "bg-nextflow-green"}`}
                            style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                          />
                        </div>
                      ) : (
                        <span className="text-gray-500">{entry.cached ? "reused" : "–"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
};

export default RunPerformance;
