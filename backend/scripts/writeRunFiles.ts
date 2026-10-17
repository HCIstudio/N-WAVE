// For each lint fixture written by frontend/scripts/lint/buildProjects.ts,
// write the files a run of it uses next to its exported project:
//   project/run.nf                the script as the backend runs it
//   project/nwave_modules.config  the config the backend writes for it
// so `nextflow lint` checks what actually runs, not only what is exported.
//
//   npx ts-node --transpile-only scripts/writeRunFiles.ts <out>

import fs from "node:fs";
import path from "node:path";
import { normalizeSubmittedScript } from "../src/execution/nextflowScript";
import { buildScriptRunFiles, MODULE_CONFIG_FILE } from "../src/execution/prepareRun";
import { buildResourceLimitsConfig } from "../src/execution/resources";

const out = path.resolve(process.argv[2] ?? "lint-out");
// The limits a run gets; their values don't matter for linting.
const resourceConfig = buildResourceLimitsConfig({ cpus: 2, memory: "4.GB" });

for (const fixture of fs.readdirSync(out)) {
  const generated = path.join(out, fixture, "generated.nf");
  if (!fs.existsSync(generated)) continue;
  const run = buildScriptRunFiles(
    normalizeSubmittedScript(fs.readFileSync(generated, "utf8")),
    { useDocker: true, resourceConfig }
  );
  const project = path.join(out, fixture, "project");
  fs.writeFileSync(path.join(project, "run.nf"), run.script);
  fs.writeFileSync(path.join(project, MODULE_CONFIG_FILE), run.config);
  console.log(`${fixture}: run.nf and ${MODULE_CONFIG_FILE}`);
}
