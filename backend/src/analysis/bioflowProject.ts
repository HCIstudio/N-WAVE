// The project an analysis reads: the workflow's script as main.nf, the
// nf-core modules and subworkflows it includes (installed like a run's), and
// any other files sent with it (an imported project's local modules).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { materializeNfCoreModules } from "../execution/materializeNfCore";
import {
  getReferencedNfCoreModules,
  getReferencedNfCoreSubworkflows,
} from "../execution/nextflowScript";
import { ensureModulesInstalled, ensureSubworkflowsInstalled } from "../nfcore/library";

export interface AnalysisProject {
  entry: string;
  /** Text files by path from the project folder. */
  files: Record<string, string>;
}

/** The project's files an analysis reads: scripts and configs. */
const ANALYSED = /\.(nf|config)$/;

/**
 * The script without N-WAVE's settings comment (`/* N-WAVE_NEXTFLOW_CONFIG … *\/`),
 * which a run moves into its config. Its lines stay, empty, so lines in the
 * analysis are the lines of the script the canvas generated.
 */
export const blankNwaveConfig = (script: string): string =>
  script.replace(/\/\*\s*N-WAVE_NEXTFLOW_CONFIG[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""));

/** A path inside the project: relative, no `..`, no backslashes. */
export const isProjectPath = (value: string): boolean =>
  value !== "" &&
  !value.includes("\\") &&
  !path.posix.isAbsolute(value) &&
  !value.split("/").some((part) => part === ".." || part === "");

const readTree = (root: string, files: Record<string, string>, folder = ""): void => {
  for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
    const relative = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) readTree(root, files, relative);
    else if (entry.isFile() && ANALYSED.test(entry.name)) {
      files[relative] = fs.readFileSync(path.join(root, relative), "utf8");
    }
  }
};

/**
 * Build the project for `nextflowScript`. nf-core components it includes are
 * installed first when missing (from the catalog's pinned commit, as for a
 * run): that is the backend downloading them, never the analysis itself.
 */
export const buildAnalysisProject = async (
  nextflowScript: string,
  extraFiles: Record<string, string> = {}
): Promise<AnalysisProject> => {
  const script = blankNwaveConfig(nextflowScript);
  await ensureModulesInstalled(getReferencedNfCoreModules(script));
  await ensureSubworkflowsInstalled(getReferencedNfCoreSubworkflows(script));

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-analysis-"));
  try {
    materializeNfCoreModules(script, [folder]);
    const files: Record<string, string> = {};
    readTree(folder, files);
    for (const [file, content] of Object.entries(extraFiles)) {
      if (!isProjectPath(file)) throw new Error(`Not a file inside the project: ${file}`);
      if (file !== "main.nf") files[file] = content;
    }
    files["main.nf"] = script;
    return { entry: "main.nf", files };
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
};
