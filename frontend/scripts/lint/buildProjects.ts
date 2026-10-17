// Writes each lint fixture (fixtures.ts) to <out>/<fixture>/:
//   generated.nf  the script as N-WAVE generates it (what a run sends)
//   project/      the project "Export project" downloads, nf-core files included
//
// nf-core files come from a local nf-core/modules checkout at the catalog's
// commit when NFCORE_MODULES_DIR is set, otherwise from GitHub.
//
//   npx vite-node scripts/lint/buildProjects.ts -- <out>

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  buildProjectFiles,
  resolveNfCoreComponents,
} from "../../src/export/exportProject";
import { generateNextflowScript } from "../../src/generators/core/generateNextflowScript";
import catalog from "../../src/registry/nfcore/catalog.json";
import { getWorkflowInputFiles } from "../../src/utils/inputFiles";
import { buildLintFixtures } from "./fixtures";

interface CatalogEntry {
  id: string;
  source: { commit: string; path: string };
  files?: { paths?: string[] };
}

const entries = new Map<string, CatalogEntry>(
  [
    ...(catalog as { modules: CatalogEntry[] }).modules,
    ...((catalog as { subworkflows?: CatalogEntry[] }).subworkflows ?? []),
  ].map((entry) => [entry.id, entry]),
);

const localDir = process.env.NFCORE_MODULES_DIR;

const readComponentFile = async (
  entry: CatalogEntry,
  file: string,
): Promise<string | undefined> => {
  if (localDir) {
    try {
      return readFileSync(join(localDir, entry.source.path, file), "utf8");
    } catch {
      return undefined;
    }
  }
  const url = `https://raw.githubusercontent.com/nf-core/modules/${entry.source.commit}/${entry.source.path}/${file}`;
  const response = await fetch(url);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
};

/** The files of an nf-core module or subworkflow, by relative path. */
const componentFiles = async (id: string): Promise<Record<string, string>> => {
  const entry = entries.get(id);
  if (!entry) throw new Error(`${id} is not in the nf-core catalog`);
  const files: Record<string, string> = {};
  for (const file of entry.files?.paths ?? ["main.nf", "meta.yml"]) {
    const content = await readComponentFile(entry, file);
    if (content !== undefined) files[file] = content;
  }
  if (!files["main.nf"]) throw new Error(`${id} has no main.nf`);
  return files;
};

const writeFiles = (root: string, files: Record<string, string>) => {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
};

const main = async () => {
  const out = resolve(process.argv[2] ?? "lint-out");
  rmSync(out, { recursive: true, force: true });

  for (const fixture of buildLintFixtures()) {
    const script = generateNextflowScript(
      fixture.nodes,
      fixture.edges,
      fixture.name,
      "results",
      "{workflow_name}",
    );

    // Subworkflows first: what they include decides which modules are needed.
    const subworkflowFiles: Record<string, Record<string, string>> = {};
    for (;;) {
      const { unresolved } = resolveNfCoreComponents(
        script,
        (name) => subworkflowFiles[name]?.["main.nf"],
      );
      if (unresolved.length === 0) break;
      for (const name of unresolved) {
        subworkflowFiles[name] = await componentFiles(
          `nf-core/subworkflows/${name}`,
        );
      }
    }
    const { modules } = resolveNfCoreComponents(
      script,
      (name) => subworkflowFiles[name]?.["main.nf"],
    );
    const moduleFiles: Record<string, Record<string, string>> = {};
    for (const module of modules) {
      moduleFiles[module] = await componentFiles(`nf-core/${module}`);
    }

    const dir = join(out, fixture.name);
    writeFiles(dir, { "generated.nf": script });
    writeFiles(
      join(dir, "project"),
      buildProjectFiles({
        workflowName: fixture.name,
        script,
        inputFiles: getWorkflowInputFiles(fixture.nodes),
        moduleFiles,
        subworkflowFiles,
      }),
    );
    process.stdout.write(
      `${fixture.name}: ${fixture.description} (${modules.length} modules, ${Object.keys(subworkflowFiles).length} subworkflows)\n`,
    );
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
