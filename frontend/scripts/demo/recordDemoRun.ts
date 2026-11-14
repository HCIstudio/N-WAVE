// Records a finished run of a built-in example for the demo
// (src/demo/recordedRuns/<name>.json): what N-WAVE's API answers for it.
//
//   npx vite-node scripts/demo/recordDemoRun.ts -- <runId> <builtin workflow id> <name> [api]
//
// e.g. `... -- bee_3 builtin:demo-basic demo-1`, with N-WAVE on http://localhost:5001/api.
// The run's workflow becomes the built-in example, so the demo's copy of it
// shows the run.

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

const recording: Record<string, unknown> = {
  run: { ...run, workflowId },
  log: await get(`${base}/log`, true),
  // The demo can't open the HTML reports: only the trace's numbers.
  reports: { ...((await get(`${base}/reports`)) as object), report: false, timeline: false },
  tasks: ((await get(`${base}/tasks`)) as { tasks: unknown[] }).tasks,
  trace: ((await get(`${base}/trace`)) as { tasks: unknown[] }).tasks,
};

const file = join(__dirname, "..", "..", "src", "demo", "recordedRuns", `${name}.json`);
writeFileSync(file, `${JSON.stringify(recording, null, 1)}\n`);
process.stdout.write(`Recorded ${runId} as ${file}\n`);
