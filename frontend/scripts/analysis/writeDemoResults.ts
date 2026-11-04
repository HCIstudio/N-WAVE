// The demo's recorded analyses (src/demo/analysisResults.json), from the
// backend's results: the steps' code is left out (the demo doesn't show it).
//
//   npx vite-node scripts/analysis/writeDemoResults.ts -- <results.json>

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const input = process.argv[process.argv.length - 1];
const results = JSON.parse(readFileSync(input, "utf8")) as Record<
  string,
  { bioflow: { result: { steps: Array<{ code: string }> } } }
>;
for (const result of Object.values(results)) {
  for (const step of result.bioflow.result.steps) step.code = "";
}
const sorted = Object.fromEntries(
  Object.entries(results).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(
  join(__dirname, "..", "..", "src", "demo", "analysisResults.json"),
  `${JSON.stringify(sorted, null, 1)}\n`,
);
