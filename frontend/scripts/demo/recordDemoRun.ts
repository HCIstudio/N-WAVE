// Records a finished run of a built-in example for the demo
// (src/demo/recordedRuns/<name>.json): what N-WAVE's API answers for it.
//
//   npx vite-node scripts/demo/recordDemoRun.ts -- <runId> <builtin workflow id> <name> [api]
//
// e.g. `... -- bee_3 builtin:demo-basic demo-1`, with N-WAVE on http://localhost:5001/api.
// The run's workflow becomes the built-in example, so the demo's copy of it
// shows the run. The recording keeps no dates (src/demo/recordedRuns.ts):
// its times count from the run's creation, and its id ends in 0.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const separator = process.argv.indexOf("--");
const args = separator >= 0 ? process.argv.slice(separator + 1) : process.argv.slice(2);
const [runId, workflowId, name, api = "http://localhost:5001/api"] = args;
if (!runId || !workflowId || !name) {
  console.error("Usage: recordDemoRun.ts -- <runId> <builtin workflow id> <name> [api]");
  process.exit(2);
}

const get = async (path: string, text = false): Promise<unknown> => {
  const response = await fetch(`${api}${path}`);
  if (!response.ok) throw new Error(`GET ${path}: HTTP ${response.status}`);
  return text ? response.text() : response.json();
};

const base = `/execute/runs/${encodeURIComponent(runId)}`;
const { runs } = (await get(`/execute/runs?limit=500`)) as { runs: Array<Record<string, unknown>> };
const run = runs.find((candidate) => candidate.id === runId);
if (!run) throw new Error(`No run ${runId}`);
if (run.status === "running") throw new Error(`Run ${runId} is still going`);

// When N-WAVE created the run: its id's suffix (else its start).
const origin = Number(runId.match(/_(\d{13})$/)?.[1] ?? Date.parse(String(run.startedAt)));
const id = runId.replace(/_\d{13}$/, "_0");
const since = (iso: unknown) => (typeof iso === "string" ? Date.parse(iso) - origin : undefined);
const sinceMs = (ms: unknown) => (typeof ms === "number" ? ms - origin : null);
const secondsSince = (seconds: number) => Math.round(seconds * 1000 - origin) / 1000;
const log = ((await get(`${base}/log`, true)) as string)
  .split(runId)
  .join(id)
  .replace(/Completed at: \d\d-\w{3}-\d{4} \d\d:\d\d:\d\d/g, "Completed at: {completedAt}");

const monitor = (await get(`${base}/monitor`)) as Record<string, unknown>;
const accesses = (await get(`${base}/accesses`)) as { tasks?: Array<{ start: number; end: number }> };

const recording: Record<string, unknown> = {
  run: { ...run, id, workflowId, startedAt: since(run.startedAt), finishedAt: since(run.finishedAt) },
  log,
  // The demo can't open the HTML reports: only the trace's numbers.
  reports: { ...((await get(`${base}/reports`)) as object), report: false, timeline: false },
  tasks: ((await get(`${base}/tasks`)) as { tasks: unknown[] }).tasks,
  trace: ((await get(`${base}/trace`)) as { tasks: Array<Record<string, unknown>> }).tasks.map((task) => ({
    ...task,
    submit: sinceMs(task.submit),
    start: sinceMs(task.start),
    complete: sinceMs(task.complete),
  })),
  // What the I/O monitor recorded, if it was on, linked to the run's tasks:
  // its start and stop in ms, each task's first and last access in seconds.
  monitor: { ...monitor, startedAt: since(monitor.startedAt), stoppedAt: since(monitor.stoppedAt) },
  accesses: {
    ...accesses,
    tasks: accesses.tasks?.map((task) => ({ ...task, start: secondsSince(task.start), end: secondsSince(task.end) })),
  },
};

const file = join(__dirname, "..", "..", "src", "demo", "recordedRuns", `${name}.json`);
// Compact: the recordings are data, and large.
writeFileSync(file, `${JSON.stringify(recording)}\n`);
process.stdout.write(`Recorded ${runId} as ${file}\n`);
