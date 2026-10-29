import fs from "node:fs";
import path from "node:path";

// Nextflow's execution report, timeline and trace for every run N-WAVE
// starts. The run's config turns them on and writes them to a folder of the
// run's own (a resumed run shares its folder with earlier runs), whatever the
// pipeline's own config says. Runs from before that may still have the ones
// nf-core pipelines write into results/pipeline_info.

export const REPORT_FILES = {
  report: "execution_report.html",
  timeline: "execution_timeline.html",
  trace: "execution_trace.txt",
} as const;

export type ReportKind = keyof typeof REPORT_FILES;

export const isReportKind = (value: string): value is ReportKind => value in REPORT_FILES;

/** The run's report folder, relative to its directory. */
export const runReportsDir = (runId: string): string => `nwave_reports/${runId}`;

/** What the trace records: raw numbers (ms, bytes), with what each task asked for. */
const TRACE_FIELDS = [
  "task_id",
  "hash",
  "name",
  "process",
  "tag",
  "status",
  "exit",
  "attempt",
  "submit",
  "start",
  "complete",
  "duration",
  "realtime",
  "%cpu",
  "peak_rss",
  "cpus",
  "memory",
  "time",
];

/** Config that turns the report, timeline and trace on for the run `runId`. */
export const buildReportsConfig = (runId: string): string => {
  const dir = runReportsDir(runId);
  const block = (scope: string, kind: ReportKind, extra: string[] = []) =>
    [
      `${scope} {`,
      "  enabled = true",
      `  file = '${dir}/${REPORT_FILES[kind]}'`,
      "  overwrite = true",
      ...extra.map((line) => `  ${line}`),
      "}",
    ].join("\n");
  return [
    "// Nextflow's execution report, timeline and trace, where N-WAVE shows them from.",
    block("report", "report"),
    block("timeline", "timeline"),
    block("trace", "trace", [`fields = '${TRACE_FIELDS.join(",")}'`, "raw = true"]),
  ].join("\n");
};

/** The newest file in `dir` whose name starts with `prefix`, or null. */
const newestStartingWith = (dir: string, prefix: string): string | null => {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => path.join(dir, entry.name));
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] ?? null;
};

/** The run's report files that exist, by kind. */
export const findRunReports = (
  runDir: string,
  runId: string
): Partial<Record<ReportKind, string>> => {
  const found: Partial<Record<ReportKind, string>> = {};
  const own = path.join(runDir, runReportsDir(runId));
  const pipelineInfo = path.join(runDir, "results", "pipeline_info");
  for (const kind of Object.keys(REPORT_FILES) as ReportKind[]) {
    const file = path.join(own, REPORT_FILES[kind]);
    if (fs.existsSync(file)) {
      found[kind] = file;
      continue;
    }
    // From before: what an nf-core pipeline wrote itself.
    const stem = REPORT_FILES[kind].replace(/\.\w+$/, "");
    const fallback = newestStartingWith(pipelineInfo, stem);
    if (fallback) found[kind] = fallback;
  }
  return found;
};

export interface TraceTask {
  /** e.g. "89/2627b9" (also the task's work directory). */
  hash: string;
  name: string;
  /** Process name without the tag, e.g. "NFCORE_RNASEQ:RNASEQ:FASTQC". */
  process: string;
  status: string;
  exit: number | null;
  attempt: number;
  /** Epoch milliseconds. */
  submit: number | null;
  start: number | null;
  complete: number | null;
  /** Milliseconds from submission, and running. */
  duration: number | null;
  realtime: number | null;
  /** Percent of one CPU (200 = two CPUs busy). */
  cpu: number | null;
  /** Bytes. */
  peakRss: number | null;
  /** What the task asked for. */
  cpus: number | null;
  memory: number | null;
}

const missing = (value: string | undefined): boolean =>
  value === undefined || value === "" || value === "-";

const number = (value: string | undefined): number | null => {
  if (missing(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const DURATION_UNITS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Milliseconds: raw ("1234") or as Nextflow prints them ("1h 2m 3s", "450ms"). */
export const parseTraceDuration = (value: string | undefined): number | null => {
  const raw = number(value);
  if (raw !== null || missing(value)) return raw;
  let total = 0;
  let matched = false;
  for (const [, amount, unit] of (value ?? "").matchAll(/(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)\b/g)) {
    total += Number(amount) * (DURATION_UNITS[unit ?? ""] ?? 0);
    matched = true;
  }
  return matched ? Math.round(total) : null;
};

const BYTE_UNITS: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };

/** Bytes: raw ("1234") or as Nextflow prints them ("12.3 MB"). */
export const parseTraceBytes = (value: string | undefined): number | null => {
  const raw = number(value);
  if (raw !== null || missing(value)) return raw;
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
  return match ? Math.round(Number(match[1]) * (BYTE_UNITS[(match[2] ?? "").toUpperCase()] ?? 0)) : null;
};

/** Epoch milliseconds: raw, or "2026-10-27 10:50:20.123". */
const parseTraceTime = (value: string | undefined): number | null => {
  const raw = number(value);
  if (raw !== null || missing(value)) return raw;
  const parsed = Date.parse((value ?? "").replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : null;
};

/** The tasks in a trace file (tab separated, with a header row). */
export const parseTrace = (text: string): TraceTask[] => {
  const [header, ...rows] = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (!header) return [];
  const columns = header.split("\t");
  return rows.map((row) => {
    const cells = row.split("\t");
    const get = (field: string) => cells[columns.indexOf(field)];
    const name = get("name") ?? "";
    return {
      hash: get("hash") ?? "",
      name,
      process: missing(get("process")) ? name.replace(/\s+\(.*\)$/, "") : (get("process") as string),
      status: get("status") ?? "",
      exit: number(get("exit")),
      attempt: number(get("attempt")) ?? 1,
      submit: parseTraceTime(get("submit")),
      start: parseTraceTime(get("start")),
      complete: parseTraceTime(get("complete")),
      duration: parseTraceDuration(get("duration")),
      realtime: parseTraceDuration(get("realtime")),
      cpu: number(get("%cpu")?.replace("%", "")),
      peakRss: parseTraceBytes(get("peak_rss")),
      cpus: number(get("cpus")),
      memory: parseTraceBytes(get("memory")),
    };
  });
};
