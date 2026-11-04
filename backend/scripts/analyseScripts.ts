// Analyse scripts as POST /api/analysis does (nextflow lint and
// BioFlow-Insight), for the browser demo's recorded results.
//
//   npx tsx scripts/analyseScripts.ts <scripts.json> <results.json>
//
// scripts.json: { key: script }; results.json: { key: { lint, bioflow } },
// each part { status: "done", result } or { status, reason }.

import fs from "node:fs";
import { buildAnalysisProject } from "../src/analysis/bioflowProject";
import { BioflowUnavailableError, runBioflowAnalysis } from "../src/analysis/bioflowRunner";
import { LintUnavailableError, runNextflowLint } from "../src/analysis/lintRunner";

const settle = async <T>(run: () => Promise<T>, Unavailable: new (...args: never[]) => Error) => {
  try {
    return { status: "done" as const, result: await run() };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    return error instanceof Unavailable ? { status: "unavailable" as const, reason } : { status: "failed" as const, reason };
  }
};

const main = async () => {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("usage: analyseScripts.ts <scripts.json> <results.json>");
  const scripts = JSON.parse(fs.readFileSync(input, "utf8")) as Record<string, string>;
  const results: Record<string, unknown> = {};
  for (const [key, script] of Object.entries(scripts)) {
    const project = await buildAnalysisProject(script);
    const [lint, bioflow] = await Promise.all([
      settle(() => runNextflowLint(project), LintUnavailableError),
      settle(() => runBioflowAnalysis(project), BioflowUnavailableError),
    ]);
    if (lint.status !== "done" || bioflow.status !== "done") {
      throw new Error(`${key}: ${lint.status !== "done" ? lint.reason : ""} ${bioflow.status !== "done" ? bioflow.reason : ""}`);
    }
    results[key] = { lint, bioflow };
    process.stdout.write(`analysed ${key}\n`);
  }
  fs.writeFileSync(output, `${JSON.stringify(results)}\n`);
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
