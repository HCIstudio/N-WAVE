// Runs of the built-in examples, recorded on a real installation, so the
// demo (which can't run workflows) shows what comes of a run: History,
// Performance and each node's Results. Recorded with
// `scripts/recordDemoRun.ts` from what N-WAVE's API answered for the run.

import type { RunReportKind, RunSummary, RunTask, TraceTask } from "../api/runs";

export interface RecordedRun {
  run: RunSummary;
  log: string;
  reports: Record<RunReportKind, boolean>;
  tasks: RunTask[];
  trace: TraceTask[];
  /** Later recordings add more of the run (e.g. the I/O monitor's). */
  [extra: string]: unknown;
}

/** The recordings, loaded when first asked for (they aren't small). */
const recordings = import.meta.glob<RecordedRun>("./recordedRuns/*.json", { import: "default" });

let loaded: Promise<RecordedRun[]> | null = null;

export const loadRecordedRuns = (): Promise<RecordedRun[]> => {
  loaded ??= Promise.all(Object.values(recordings).map((load) => load())).then((runs) =>
    runs.sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt)),
  );
  return loaded;
};

export const findRecordedRun = async (runId: string): Promise<RecordedRun | undefined> =>
  (await loadRecordedRuns()).find((recorded) => recorded.run.id === runId);

/** The recorded runs of a workflow (all of them without one), newest first. */
export const listRecordedRuns = async (workflowId?: string): Promise<RunSummary[]> =>
  (await loadRecordedRuns())
    .filter((recorded) => !workflowId || recorded.run.workflowId === workflowId)
    .map((recorded) => recorded.run);

/** Said where the demo doesn't keep what a real run would have. */
export const RECORDED_RUN_NOTE =
  "This is a run recorded on an installation: the demo keeps its numbers, not its files.";

/**
 * The answer to a GET of a run's endpoints, or undefined when the path isn't
 * one of them. `notFound` builds the error for a missing run.
 */
export const answerRecordedRun = async (
  path: string,
  query: Record<string, string>,
): Promise<{ status: number; data: unknown } | undefined> => {
  if (path === "/execute/runs") {
    const runs = await listRecordedRuns(query.workflowId);
    const limit = Number(query.limit);
    return { status: 200, data: { runs: limit > 0 ? runs.slice(0, limit) : runs } };
  }
  const match = path.match(/^\/execute\/runs\/([^/]+)\/(.+)$/);
  if (!match) return undefined;
  const recorded = await findRecordedRun(decodeURIComponent(match[1] ?? ""));
  const rest = match[2] ?? "";
  if (!recorded) return { status: 404, data: { message: "Unknown run" } };
  if (rest === "log") return { status: 200, data: recorded.log };
  if (rest === "reports") return { status: 200, data: recorded.reports };
  if (rest === "trace") return { status: 200, data: { id: recorded.run.id, tasks: recorded.trace } };
  if (rest === "tasks") return { status: 200, data: { id: recorded.run.id, tasks: recorded.tasks } };
  return { status: 404, data: { message: RECORDED_RUN_NOTE } };
};
