// A run's folder: workflow/ (script and config), inputs/ (uploaded files),
// results/ (published outputs) and nextflow/ (Nextflow's own metadata).

import fs from "node:fs";
import path from "node:path";

export interface RunDirectories {
  main: string;
  workflow: string;
  inputs: string;
  results: string;
  nextflow: string;
}

/**
 * Create a run's folder under the output directory (relative ones are under
 * the server's working directory).
 */
export const createRunDirectories = (
  outputDirectory: string,
  outputName: string
): RunDirectories => {
  const main = path.isAbsolute(outputDirectory)
    ? path.join(outputDirectory, outputName)
    : path.join(process.cwd(), outputDirectory, outputName);
  const dirs = {
    main,
    workflow: path.join(main, "workflow"),
    inputs: path.join(main, "inputs"),
    results: path.join(main, "results"),
    nextflow: path.join(main, "nextflow"),
  };
  for (const dir of [dirs.workflow, dirs.inputs, dirs.results, dirs.nextflow]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dirs;
};

/**
 * Write uploaded files into inputs/. File names are validated by the request
 * schema to be plain names (no path separators), so they cannot escape it.
 */
export const writeInputFiles = (
  inputsDir: string,
  fileContent: Record<string, string> | undefined
): void => {
  for (const [fileName, content] of Object.entries(fileContent ?? {})) {
    fs.writeFileSync(path.join(inputsDir, fileName), content);
  }
};

/** Move Nextflow's .nextflow/ and .nextflow.log into nextflow/. */
export const moveNextflowMetadata = (dirs: RunDirectories): void => {
  const moves: Array<[string, string]> = [
    [path.join(dirs.main, ".nextflow"), path.join(dirs.nextflow, ".nextflow")],
    [path.join(dirs.main, ".nextflow.log"), path.join(dirs.nextflow, ".nextflow.log")],
  ];
  try {
    for (const [from, to] of moves) {
      if (!fs.existsSync(from)) continue;
      if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
      fs.renameSync(from, to);
    }
  } catch (error) {
    // The run succeeded; its metadata just stays where Nextflow put it.
    console.warn("Warning: Could not move Nextflow metadata files:", error);
  }
};
