import type React from "react";
import { useEffect, useState } from "react";
import {
  getTaskFileText,
  listTaskFiles,
  type RunResultFile,
  type RunTask,
  taskFileUrl,
} from "../../../api/runs";
import { useNodeRun } from "../../../execution/RunTasksContext";
import { getErrorMessage } from "../../../utils/errors";

const TEXT_FILE = /\.(txt|csv|tsv|json|log|md|ya?ml|out|tab|bed|gtf|gff3?|sam|vcf)$/i;
const PREVIEW_LIMIT = 200_000;

const STATUS_STYLE: Record<RunTask["status"], string> = {
  running: "bg-yellow-100 text-yellow-900",
  succeeded: "bg-green-100 text-green-900",
  cached: "bg-green-100 text-green-900",
  failed: "bg-red-100 text-red-900",
};

const formatSize = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

/** One task of the node: its files, and a preview of a text file. */
const TaskResults: React.FC<{
  runId: string;
  task: RunTask;
  previewFirst: boolean;
}> = ({ runId, task, previewFirst }) => {
  const [files, setFiles] = useState<RunResultFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ path: string; text: string } | null>(
    null,
  );

  // Reload when the task finishes: its outputs appear then.
  // biome-ignore lint/correctness/useExhaustiveDependencies: task.status is the reload signal.
  useEffect(() => {
    let cancelled = false;
    listTaskFiles(runId, task.hash).then(
      (list) => !cancelled && setFiles(list),
      (loadError: unknown) =>
        !cancelled &&
        setError(getErrorMessage(loadError, "Could not list the files.")),
    );
    return () => {
      cancelled = true;
    };
  }, [runId, task.hash, task.status]);

  const showPreview = async (file: RunResultFile) => {
    try {
      const text = await getTaskFileText(runId, task.hash, file.path);
      setPreview({ path: file.path, text });
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Could not load the file."));
    }
  };

  // The first text file, skipping manifests (Display Output writes one).
  const textFiles = (files ?? []).filter(
    (file) => TEXT_FILE.test(file.path) && file.size <= PREVIEW_LIMIT,
  );
  const firstText =
    textFiles.find((file) => !/manifest/i.test(file.path)) ?? textFiles[0];
  // biome-ignore lint/correctness/useExhaustiveDependencies: preview once per file list.
  useEffect(() => {
    if (previewFirst && firstText && task.status !== "running") {
      void showPreview(firstText);
    }
  }, [previewFirst, firstText?.path, task.status]);

  return (
    <li className="space-y-2 rounded-md border border-panel-border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[task.status]}`}
        >
          {task.status}
        </span>
        <span className="font-mono text-xs text-text">{task.name}</span>
        {task.exitCode !== undefined && task.exitCode !== 0 && (
          <span className="text-xs text-red-300">exit {task.exitCode}</span>
        )}
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {files === null && !error && (
        <p className="text-xs text-text-light">Loading files…</p>
      )}
      {files && files.length === 0 && (
        <p className="text-xs text-text-light">
          {task.status === "running"
            ? "No files yet: the step is still running."
            : "This step produced no files."}
        </p>
      )}
      {files && files.length > 0 && (
        <ul aria-label={`Files of ${task.name}`} className="space-y-1 text-xs">
          {files.map((file) => (
            <li key={file.path} className="flex items-center gap-2">
              <a
                href={taskFileUrl(runId, task.hash, file.path)}
                target="_blank"
                rel="noreferrer"
                className="truncate text-sky-300 underline underline-offset-2 hover:text-sky-200"
              >
                {file.path}
              </a>
              <span className="shrink-0 text-text-light">
                {formatSize(file.size)}
              </span>
              {TEXT_FILE.test(file.path) && file.size <= PREVIEW_LIMIT && (
                <button
                  type="button"
                  onClick={() => void showPreview(file)}
                  className="shrink-0 rounded px-1.5 text-text-light hover:bg-accent hover:text-text"
                >
                  Preview
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {preview && (
        <figure>
          <figcaption className="mb-1 text-xs text-text-light">
            {preview.path}
          </figcaption>
          <pre
            role="document"
            aria-label={`Preview of ${preview.path}`}
            className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-900 p-2 font-mono text-xs text-gray-100"
          >
            {preview.text}
          </pre>
        </figure>
      )}
    </li>
  );
};

/** What this node did in the last run: its tasks and the files they made. */
const NodeRunResults: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const { runId, summary } = useNodeRun(nodeId);
  if (!runId || !summary) {
    return (
      <p className="text-sm text-text-light">
        Run the workflow to see what this step produces. Its files show up
        here while and after it runs.
      </p>
    );
  }
  return (
    <section aria-label="Run results of this step" className="space-y-2">
      <p className="text-sm text-text-light">
        Last run: {summary.done} of {summary.total} task
        {summary.total === 1 ? "" : "s"} done
        {summary.running > 0 ? `, ${summary.running} running` : ""}
        {summary.failed > 0 ? `, ${summary.failed} failed` : ""}.
      </p>
      <ul className="space-y-2">
        {summary.tasks.map((task, index) => (
          <TaskResults
            key={task.hash}
            runId={runId}
            task={task}
            previewFirst={index === 0}
          />
        ))}
      </ul>
    </section>
  );
};

export default NodeRunResults;

/** The last run's results above other panel content, when there was one. */
export const LastRunSection: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const { summary } = useNodeRun(nodeId);
  if (!summary) return null;
  return (
    <details open className="rounded-md border border-panel-border p-3">
      <summary className="cursor-pointer text-sm font-semibold text-text">
        Results of the last run
      </summary>
      <div className="mt-3">
        <NodeRunResults nodeId={nodeId} />
      </div>
    </details>
  );
};
