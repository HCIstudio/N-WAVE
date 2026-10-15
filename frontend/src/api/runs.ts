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

/** URL that serves one result file (reports open in a new tab). */
export const runResultUrl = (runId: string, path: string): string =>
  `${import.meta.env.VITE_API_BASE_URL || "/api"}/execute/runs/${encodeURIComponent(runId)}/file?path=${encodeURIComponent(path)}`;

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
