import fs from "node:fs";
import path from "node:path";

// Where nf-core module files live on the backend: modules installed from the
// library (under the N-WAVE data dir) take precedence over the ones bundled
// with the app (FastQC, Trimmomatic).

/** Root of N-WAVE's persistent data (installed modules, indexes). */
export const getNwaveDataRoot = (): string =>
  path.resolve(
    process.env.NWAVE_DATA_DIR || path.join(process.cwd(), "results", ".nwave")
  );

const installedModuleRoots = (): string[] => {
  const installedRoot = path.join(
    getNwaveDataRoot(),
    "nf-core",
    "modules",
    "nf-core"
  );
  return fs.existsSync(installedRoot) ? [installedRoot] : [];
};

const bundledModuleRoots = (): string[] =>
  ["dist", "src"]
    .map((base) =>
      path.join(
        process.cwd(),
        base,
        "workflows",
        "library",
        "assets",
        "nf-core",
        "modules",
        "nf-core"
      )
    )
    .filter((candidate) => fs.existsSync(candidate));

/** Valid nf-core module names: "fastqc", "samtools/sort", ... */
export const isValidModuleName = (moduleName: string): boolean =>
  /^[A-Za-z0-9_/-]+$/.test(moduleName) &&
  moduleName.split("/").every((segment) => segment !== "" && segment !== "..");

/** Directory holding a module's files, or null when it isn't available. */
export const findNfCoreModuleDir = (moduleName: string): string | null => {
  if (!isValidModuleName(moduleName)) return null;
  return (
    [...installedModuleRoots(), ...bundledModuleRoots()]
      .map((root) => path.join(root, ...moduleName.split("/")))
      .find((candidate) => fs.existsSync(path.join(candidate, "main.nf"))) ??
    null
  );
};

/** Like findNfCoreModuleDir, but throws a helpful error when missing. */
export const resolveNfCoreModuleDir = (moduleName: string): string => {
  const dir = findNfCoreModuleDir(moduleName);
  if (!dir) {
    const roots = [...installedModuleRoots(), ...bundledModuleRoots()];
    throw new Error(
      `nf-core module "${moduleName}" is not installed or bundled. Checked roots: ${roots.join(", ")}`
    );
  }
  return dir;
};
