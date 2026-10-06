import fs from "node:fs";
import path from "node:path";

// Where nf-core module and subworkflow files live on the backend: installed
// from the library, under the N-WAVE data dir. Runs install missing modules first
// (see ensureModulesInstalled in src/nfcore/library.ts).

/** Root of N-WAVE's persistent data (installed modules, indexes). */
export const getNwaveDataRoot = (): string =>
  path.resolve(
    process.env.NWAVE_DATA_DIR || path.join(process.cwd(), "results", ".nwave")
  );

const installedModuleRoot = (): string =>
  path.join(getNwaveDataRoot(), "nf-core", "modules", "nf-core");

/** Valid nf-core module names: "fastqc", "samtools/sort", ... */
export const isValidModuleName = (moduleName: string): boolean =>
  /^[A-Za-z0-9_/-]+$/.test(moduleName) &&
  moduleName.split("/").every((segment) => segment !== "" && segment !== "..");

/** Directory holding an installed module's files, or null. */
export const findNfCoreModuleDir = (moduleName: string): string | null => {
  if (!isValidModuleName(moduleName)) return null;
  const candidate = path.join(installedModuleRoot(), ...moduleName.split("/"));
  return fs.existsSync(path.join(candidate, "main.nf")) ? candidate : null;
};

/** Like findNfCoreModuleDir, but throws a helpful error when missing. */
export const resolveNfCoreModuleDir = (moduleName: string): string => {
  const dir = findNfCoreModuleDir(moduleName);
  if (!dir) {
    throw new Error(
      `nf-core module "${moduleName}" is not installed (looked in ${installedModuleRoot()})`
    );
  }
  return dir;
};

const installedSubworkflowRoot = (): string =>
  path.join(getNwaveDataRoot(), "nf-core", "subworkflows", "nf-core");

/** Directory holding an installed subworkflow's files, or null. */
export const findNfCoreSubworkflowDir = (name: string): string | null => {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return null;
  const candidate = path.join(installedSubworkflowRoot(), name);
  return fs.existsSync(path.join(candidate, "main.nf")) ? candidate : null;
};
