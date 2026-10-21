import api from "../api";

/** A file in a run's results directory. */
export interface RunResultFile {
  path: string;
  size: number;
}

/** Files in the results directory of a backend run. */
export const listRunResults = async (
  runId: string,
): Promise<RunResultFile[]> => {
  const response = await api.get<{ files: RunResultFile[] }>(
    `/execute/runs/${encodeURIComponent(runId)}/files`,
  );
  return response.data.files;
};

/** A file path in a URL, each part encoded ("report/a b.html" → "report/a%20b.html"). */
const pathInUrl = (path: string): string => path.split("/").map(encodeURIComponent).join("/");

/**
 * URL that serves one result file (reports open in a new tab). Path-style,
 * so a report's relative links (report_files/plot.png) reach its siblings.
 */
export const runResultUrl = (runId: string, path: string): string =>
  `${import.meta.env.VITE_API_BASE_URL || "/api"}/execute/runs/${encodeURIComponent(runId)}/results/${pathInUrl(path)}`;

/** A run the backend recorded. */
export interface RunSummary {
  id: string;
  workflowId?: string;
  workflowName?: string;
  status: "running" | "succeeded" | "failed" | "cancelled" | "unknown";
  startedAt: string;
  finishedAt?: string;
  /** Why it failed, in one line. */
  message?: string;
}

/** Recorded runs of a workflow, newest first. */
export const listRuns = async (workflowId: string): Promise<RunSummary[]> => {
  const response = await api.get<{ runs: RunSummary[] }>("/execute/runs", {
    params: { workflowId },
  });
  return response.data.runs;
};

/** A run's full output. */
export const getRunLog = async (runId: string): Promise<string> => {
  const response = await api.get<string>(
    `/execute/runs/${encodeURIComponent(runId)}/log`,
    { responseType: "text", transformResponse: (data) => data },
  );
  return response.data;
};

/** One Nextflow task of a run (from the backend's reading of its log). */
export interface RunTask {
  /** e.g. "b7/8cc335": the task's work directory. */
  hash: string;
  name: string;
  /** Process name without the tag, e.g. "ALIGN:SAMTOOLS_SORT". */
  process: string;
  status: "running" | "succeeded" | "failed" | "cached";
  exitCode?: number;
}

/** What each task of a run is doing. */
export const listRunTasks = async (runId: string): Promise<RunTask[]> => {
  const response = await api.get<{ tasks: RunTask[] }>(
    `/execute/runs/${encodeURIComponent(runId)}/tasks`,
  );
  return response.data.tasks;
};

/** Files a task produced. */
export const listTaskFiles = async (
  runId: string,
  hash: string,
): Promise<RunResultFile[]> => {
  const response = await api.get<{ files: RunResultFile[] }>(
    `/execute/runs/${encodeURIComponent(runId)}/tasks/${hash}/files`,
  );
  return response.data.files;
};

/** URL that serves one file a task produced. */
export const taskFileUrl = (runId: string, hash: string, path: string): string =>
  `${import.meta.env.VITE_API_BASE_URL || "/api"}/execute/runs/${encodeURIComponent(runId)}/tasks/${hash}/output/${pathInUrl(path)}`;

/** The text of a file a task produced. */
export const getTaskFileText = async (
  runId: string,
  hash: string,
  path: string,
): Promise<string> => {
  const response = await api.get<string>(
    `/execute/runs/${encodeURIComponent(runId)}/tasks/${hash}/file`,
    { params: { path }, responseType: "text", transformResponse: (data) => data },
  );
  return response.data;
};
