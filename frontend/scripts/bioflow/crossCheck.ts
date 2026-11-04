// Cross-check: for every lint fixture (scripts/lint), the connections
// BioFlow-Insight finds between steps must be those N-WAVE's importer finds
// in the exported project. A difference is a bug in one of them; known ones
// are listed with their reason in knownDifferences.json.
//
//   npx vite-node scripts/bioflow/crossCheck.ts -- <lint out-dir>
//
// Each <out>/<fixture>/ needs project/ (scripts/lint/buildProjects.ts) and
// bioflow.json (the analysis image run on project/, see
// scripts/bioflow-cross-check.sh).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Node } from "@xyflow/react";
import {
  type BioflowResult,
  bioflowNodeConnections,
  canvasStepConnections,
  nodesForSteps,
} from "../../src/analysis/bioflow";
import { processNamesFor } from "../../src/generators/core/naming";
import catalog from "../../src/registry/nfcore/catalog.json";
import {
  importNextflowScript,
  type NfCoreCatalogForImport,
} from "../../src/workflows/import/importScript";
import { readProject } from "../../src/workflows/import/readProject";
import known from "./knownDifferences.json";

/** Steps on the canvas: processes and nf-core modules and subworkflows. */
const isCanvasStep = (node: Node): boolean =>
  node.type === "process" ||
  typeof (node.data as { nwaveNfCoreModuleId?: unknown })
    .nwaveNfCoreModuleId === "string";

const readTree = (
  root: string,
  folder = root,
  files: Record<string, string> = {},
) => {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) readTree(root, path, files);
    else if (
      /\.(nf|config)$/.test(name) ||
      /(^|\/)inputs\//.test(relative(root, path))
    ) {
      files[relative(root, path)] = readFileSync(path, "utf8");
    }
  }
  return files;
};

const say = (line: string) => process.stdout.write(`${line}\n`);

const out = process.argv[process.argv.length - 1];
const knownDifferences = known as Record<
  string,
  { missingInBioflow?: string[]; onlyInBioflow?: string[]; reason: string }
>;
let failed = 0;
let checked = 0;
for (const fixture of readdirSync(out).sort()) {
  const folder = join(out, fixture);
  let result: BioflowResult;
  try {
    result = JSON.parse(readFileSync(join(folder, "bioflow.json"), "utf8"));
  } catch {
    continue;
  }
  checked += 1;
  const project = readProject(readTree(join(folder, "project")));
  const imported = importNextflowScript(project.source, {
    files: project.files,
    path: project.path,
    config: project.config,
    catalog: catalog as unknown as NfCoreCatalogForImport,
  });
  const names = processNamesFor(imported.nodes);
  const label = (connection: string) =>
    connection
      .split("->")
      .map((id) => names.get(id) ?? id)
      .join(" -> ");
  // A step for either: nodes the export writes as processes (Display Output,
  // Filter, ...) are steps for BioFlow-Insight too.
  const analysed = new Set(nodesForSteps(result, imported.nodes).values());
  const isStep = (node: Node) => isCanvasStep(node) || analysed.has(node.id);
  const nwave = new Set(
    [...canvasStepConnections(imported.nodes, imported.edges, isStep)].map(
      label,
    ),
  );
  const bioflow = new Set(
    [...bioflowNodeConnections(result, imported.nodes)].map(label),
  );
  const missingInBioflow = [...nwave]
    .filter((connection) => !bioflow.has(connection))
    .sort();
  const onlyInBioflow = [...bioflow]
    .filter((connection) => !nwave.has(connection))
    .sort();
  const expected = knownDifferences[fixture];
  const same = (a: string[], b: string[] = []) =>
    a.length === b.length && a.every((entry, index) => entry === b[index]);
  const problems = [
    ...(result.error
      ? [`BioFlow-Insight reports an error: ${result.error.message}`]
      : []),
    ...(same(missingInBioflow, expected?.missingInBioflow) &&
    same(onlyInBioflow, expected?.onlyInBioflow)
      ? []
      : [
          ...missingInBioflow.map(
            (connection) => `only N-WAVE connects ${connection}`,
          ),
          ...onlyInBioflow.map(
            (connection) => `only BioFlow-Insight connects ${connection}`,
          ),
        ]),
  ];
  const steps = imported.nodes.filter(isStep).length;
  if (problems.length === 0) {
    say(
      `ok       ${fixture} (${steps} steps, ${nwave.size} connections${expected ? `; known: ${expected.reason}` : ""})`,
    );
  } else {
    failed += 1;
    say(`DIFFERS  ${fixture}`);
    for (const problem of problems) say(`  ${problem}`);
  }
}
say(`\n${checked} fixtures checked, ${failed} differ.`);
if (checked === 0) {
  say("No bioflow.json found; run scripts/bioflow-cross-check.sh.");
  process.exit(1);
}
process.exit(failed > 0 ? 1 : 0);
