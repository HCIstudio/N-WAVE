// Runs of the built-in examples, recorded on a real installation, so the
// demo (which can't run workflows) shows what comes of a run: History,
// Performance and each node's Results. Recorded with
// `scripts/demo/recordDemoRun.ts` from what N-WAVE's API answered for the run.
//
// A recording keeps no dates: its times count from when N-WAVE created the
// run (milliseconds), and the run's id ends in 0 instead of that moment. The
// demo places a recording when it loads it, as a run that has just finished.

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

/** A recording as stored: its times in milliseconds from the run's creation. */
export interface StoredRun {
  run: Omit<RunSummary, "startedAt" | "finishedAt"> & { startedAt: number; finishedAt?: number };
  log: string;
  reports: Record<RunReportKind, boolean>;
  tasks: RunTask[];
  trace: TraceTask[];
  [extra: string]: unknown;
}

/** Where a recorded log had Nextflow's "Completed at:" time. */
export const COMPLETED_AT = "{completedAt}";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (value: number) => String(value).padStart(2, "0");

/** A time as Nextflow writes it in its log: 05-Mar-2030 14:07:09. */
export const nextflowLogTime = (ms: number): string => {
  const date = new Date(ms);
  return `${two(date.getDate())}-${MONTHS[date.getMonth()]}-${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
};

/** A stored recording placed in time: the run finished at `now`. */
export const placeRecordedRun = (stored: StoredRun, now: number): RecordedRun => {
  const origin = now - (stored.run.finishedAt ?? stored.run.startedAt);
  const at = (offset: number | null) => (offset === null ? null : origin + offset);
  const { startedAt, finishedAt, ...run } = stored.run;
  const finished = finishedAt === undefined ? undefined : origin + finishedAt;
  return {
    ...stored,
    run: {
      ...run,
      startedAt: new Date(origin + startedAt).toISOString(),
      ...(finished === undefined ? {} : { finishedAt: new Date(finished).toISOString() }),
    },
    log: stored.log.split(COMPLETED_AT).join(nextflowLogTime(finished ?? now)),
    trace: stored.trace.map((task) => ({ ...task, submit: at(task.submit), start: at(task.start), complete: at(task.complete) })),
  };
};

/** The recordings, loaded when first asked for (they aren't small). */
const recordings = import.meta.glob<StoredRun>("./recordedRuns/*.json", { import: "default" });

let loaded: Promise<RecordedRun[]> | null = null;

export const loadRecordedRuns = (): Promise<RecordedRun[]> => {
  const now = Date.now();
  loaded ??= Promise.all(Object.values(recordings).map((load) => load())).then((stored) =>
    stored.map((run) => placeRecordedRun(run, now)).sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt)),
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
  if (rest === "monitor") return { status: 200, data: recorded.monitor ?? { status: "off" } };
  return { status: 404, data: { message: RECORDED_RUN_NOTE } };
};
