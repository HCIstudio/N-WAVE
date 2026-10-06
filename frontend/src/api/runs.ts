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
