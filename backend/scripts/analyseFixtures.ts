// The Analyse button's check on every lint fixture: each fixture's generated
// script (frontend/scripts/lint/buildProjects.ts) is checked with nextflow
// lint and analysed with BioFlow-Insight, as POST /api/analysis does. Code
// N-WAVE writes from its own nodes must pass: any problem fails.
//
//   NWAVE_BIOFLOW_IMAGE=nwave-bioflow:dev npx tsx scripts/analyseFixtures.ts <out>

import fs from "node:fs";
import path from "node:path";
import { buildAnalysisProject } from "../src/analysis/bioflowProject";
import { runBioflowAnalysis } from "../src/analysis/bioflowRunner";
import { runNextflowLint } from "../src/analysis/lintRunner";

const out = path.resolve(process.argv[2] ?? "lint-out");
const say = (line: string) => process.stdout.write(`${line}\n`);

const main = async () => {
  let failed = 0;
  let checked = 0;
  for (const fixture of fs.readdirSync(out).sort()) {
    const generated = path.join(out, fixture, "generated.nf");
    if (!fs.existsSync(generated)) continue;
    checked += 1;
    const project = await buildAnalysisProject(fs.readFileSync(generated, "utf8"));
    const [lint, bioflow] = await Promise.all([runNextflowLint(project), runBioflowAnalysis(project)]);
    const problems = [
      ...lint.problems.map((problem) => `nextflow lint: ${problem.level} ${problem.file}:${problem.line}: ${problem.message}`),
      ...(bioflow.error ? [`BioFlow-Insight: ${bioflow.error.message}`] : []),
    ];
    if (problems.length === 0) {
      say(`ok       ${fixture} (${bioflow.steps.length} steps, ${bioflow.tool.engine})`);
    } else {
      failed += 1;
      say(`PROBLEMS ${fixture}`);
      for (const problem of problems) say(`  ${problem}`);
    }
  }
  say(`\n${checked} fixtures analysed, ${failed} with problems.`);
  process.exit(checked === 0 || failed > 0 ? 1 : 0);
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
