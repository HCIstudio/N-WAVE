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
  return openRunDirectories(main);
};

/** A run's folders at `main` (an earlier run's, when resuming), created when missing. */
export const openRunDirectories = (main: string): RunDirectories => {
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
 * Files named in fileEncoding as "base64" (binary files such as .fastq.gz)
 * are decoded to their bytes; the others are text.
 */
export const writeInputFiles = (
  inputsDir: string,
  fileContent: Record<string, string> | undefined,
  fileEncoding: Record<string, "base64"> = {}
): void => {
  const files = fileContent ?? {};
  // A resumed run reuses the folder: files the workflow no longer has go,
  // and unchanged ones are left alone, because Nextflow's cache compares
  // an input's modification time as well as its path and size.
  const names = new Set(Object.keys(files));
  for (const entry of fs.readdirSync(inputsDir, { withFileTypes: true })) {
    if (!names.has(entry.name)) {
      fs.rmSync(path.join(inputsDir, entry.name), { recursive: true, force: true });
    }
  }
  for (const [fileName, content] of Object.entries(files)) {
    const file = path.join(inputsDir, fileName);
    const bytes =
      fileEncoding[fileName] === "base64" ? Buffer.from(content, "base64") : Buffer.from(content);
    if (isSameFile(file, bytes)) continue;
    fs.writeFileSync(file, bytes);
  }
};

const isSameFile = (file: string, bytes: Buffer): boolean => {
  try {
    return fs.statSync(file).size === bytes.length && fs.readFileSync(file).equals(bytes);
  } catch {
    return false;
  }
};

/**
 * Before resuming, put Nextflow's .nextflow/ (its cache and run history)
 * back where Nextflow looks for it, after a successful run moved it.
 */
export const restoreNextflowMetadata = (dirs: RunDirectories): void => {
  const from = path.join(dirs.nextflow, ".nextflow");
  const to = path.join(dirs.main, ".nextflow");
  if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to);
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
