import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { getRunLog, listRuns, type RunSummary } from "../../../api/runs";
import { getErrorMessage } from "../../../utils/errors";
import RunResultsList from "./RunResultsList";

/** Lines that point at the problem in a Nextflow log. */
const ERROR_LINE =
  /\b(ERROR|error|Error|Exception|failed|FAILED|Caused by|not found|No such file|denied)\b/;

/** A run's output, with error lines marked, scrolled to the end. */
export const RunLog: React.FC<{ text: string; label?: string }> = ({
  text,
  label = "Run log",
}) => {
  const ref = useRef<HTMLPreElement>(null);
  // Follow the output while it grows, unless the reader scrolled up.
  const atBottom = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the text changes.
  useEffect(() => {
    const element = ref.current;
    if (element && atBottom.current) element.scrollTop = element.scrollHeight;
  }, [text]);

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Without clipboard access, the text can still be selected and copied.
      setCopied(false);
    }
  };

  if (!text.trim()) {
    return (
      <p className="p-4 text-sm text-gray-700">
        No output yet. The log fills in while the workflow runs.
      </p>
    );
  }
  return (
    <div className="relative h-full min-h-0">
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="absolute right-4 top-2 z-10 inline-flex items-center gap-1 rounded bg-gray-700 px-2 py-1 text-xs text-gray-100 hover:bg-gray-600"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre
        ref={ref}
        role="log"
        aria-label={label}
        onScroll={(event) => {
          const element = event.currentTarget;
          atBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            24;
        }}
        className="h-full min-h-0 select-text overflow-auto whitespace-pre-wrap break-words bg-gray-900 p-3 pt-9 font-mono text-xs leading-relaxed text-gray-100"
      >
        {text.split("\n").map((line, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: log lines have no other identity.
            key={index}
            className={ERROR_LINE.test(line) ? "text-red-300" : undefined}
          >
            {line}
            {"\n"}
          </span>
        ))}
      </pre>
    </div>
  );
};

const STATUS_STYLES: Record<RunSummary["status"], string> = {
  running: "bg-blue-100 text-blue-800",
  succeeded: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-200 text-gray-800",
  unknown: "bg-gray-200 text-gray-800",
};

const formatTime = (iso: string) => new Date(iso).toLocaleString();

const duration = (run: RunSummary): string => {
  if (!run.finishedAt) return "";
  const seconds = Math.max(
    0,
    Math.round(
      (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) /
        1000,
    ),
  );
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

/** One earlier run: what happened, its log and its results. */
const RunDetails: React.FC<{ run: RunSummary }> = ({ run }) => {
  const [log, setLog] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLog(null);
    setError(null);
    getRunLog(run.id).then(
      (text) => !cancelled && setLog(text),
      (loadError: unknown) =>
        !cancelled &&
        setError(getErrorMessage(loadError, "This run has no saved log.")),
    );
    return () => {
      cancelled = true;
    };
  }, [run.id]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {run.message && (
        <p className="rounded bg-red-50 p-2 text-xs text-red-800">
          {run.message}
        </p>
      )}
      {run.status === "succeeded" && (
        <section aria-label="Run results" className="space-y-1 text-gray-800">
          <RunResultsList runId={run.id} label="Run reports" />
        </section>
      )}
      <div className="min-h-[12rem] flex-1">
        {error ? (
          <p className="text-xs text-gray-700">{error}</p>
        ) : log === null ? (
          <p className="text-xs text-gray-700">Loading the log…</p>
        ) : (
          <RunLog text={log} label={`Log of run ${run.id}`} />
        )}
      </div>
    </div>
  );
};

/** The workflow's earlier runs, newest first (kept by the backend). */
const RunHistory: React.FC<{
  workflowId: string | null | undefined;
  /** Changes when a run starts or ends, to reload the list. */
  refreshKey?: unknown;
}> = ({ workflowId, refreshKey }) => {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey reloads the list.
  useEffect(() => {
    if (!workflowId) return;
    let cancelled = false;
    listRuns(workflowId).then(
      (list) => {
        if (cancelled) return;
        setRuns(list);
        setError(null);
      },
      (loadError: unknown) =>
        !cancelled &&
        setError(getErrorMessage(loadError, "Could not load the runs.")),
    );
    return () => {
      cancelled = true;
    };
  }, [workflowId, refreshKey]);

  if (!workflowId) {
    return (
      <p className="p-4 text-sm text-gray-700">
        Save the workflow to keep a history of its runs.
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className="p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }
  if (!runs) return <p className="p-4 text-sm text-gray-700">Loading runs…</p>;
  if (runs.length === 0) {
    return (
      <p className="p-4 text-sm text-gray-700">
        This workflow hasn&apos;t been run on this server yet.
      </p>
    );
  }
  const current = runs.find((run) => run.id === selected);

  return (
    <div className="flex h-full min-h-0 gap-3 p-3">
      <ul
        aria-label="Earlier runs"
        className="w-56 shrink-0 space-y-1 overflow-y-auto"
      >
        {runs.map((run) => (
          <li key={run.id}>
            <button
              type="button"
              onClick={() => setSelected(run.id)}
              aria-pressed={run.id === selected}
              className={`w-full rounded border px-2 py-1.5 text-left text-xs ${
                run.id === selected
                  ? "border-nextflow-green bg-green-50"
                  : "border-gray-300 hover:bg-gray-100"
              }`}
            >
              <span
                className={`mr-1 rounded px-1.5 py-0.5 font-medium ${STATUS_STYLES[run.status]}`}
              >
                {run.status}
              </span>
              <span className="text-gray-800">{formatTime(run.startedAt)}</span>
              {duration(run) && (
                <span className="text-gray-600"> · {duration(run)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex min-w-0 flex-1 flex-col">
        {current ? (
          <RunDetails run={current} />
        ) : (
          <p className="text-sm text-gray-700">
            Pick a run to see its log and results.
          </p>
        )}
      </div>
    </div>
  );
};

export default RunHistory;
