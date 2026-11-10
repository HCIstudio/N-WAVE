// `nextflow lint` on a workflow's project, in the nextflow/nextflow image.
// Like the BioFlow-Insight analysis, the project goes to the container on
// stdin (one line per file: its path, a tab, its content in base64; the image
// has no tar), and the container runs without network, read-only, without
// capabilities, with limits and a time limit.
//
//   NWAVE_LINT=off               no lint
//   NWAVE_LINT_IMAGE=…           the image (default nextflow/nextflow:25.10.4)
//   NWAVE_LINT_TIMEOUT=120       time limit in seconds

import { randomUUID } from "node:crypto";
import type { AnalysisProject } from "./bioflowProject";
import {
  ensureImage,
  readToolConfig,
  removeContainer,
  runDocker,
  sandboxedRunArgs,
  type ToolConfig,
  toolStatus,
} from "./dockerRun";

/**
 * The Nextflow whose lint N-WAVE uses (the CI lint job uses the same). 25.04
 * has lint too, but its JSON output fails, and the concise one is read here.
 */
export const DEFAULT_LINT_IMAGE = "nextflow/nextflow:25.10.4";
export type LintConfig = ToolConfig;

export const readLintConfig = (env: NodeJS.ProcessEnv = process.env): LintConfig =>
  readToolConfig(env, "NWAVE_LINT", DEFAULT_LINT_IMAGE);

export interface LintProblem {
  level: "error" | "warning";
  /** The file, from the project folder. */
  file: string;
  line: number;
  column: number;
  message: string;
}

export interface LintResult {
  tool: { name: "nextflow lint"; image: string };
  /** The files that were linted. */
  files: string[];
  problems: LintProblem[];
}

/** Lines of `nextflow lint -o concise`: `Error main.nf:12:5: message`, `Warn  x.nf:2:7: message`. */
const CONCISE_LINE = /^(Error|Warn)\s+(.+?):(\d+):(\d+):\s*(.*)$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: terminal colour codes are what it removes
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

export const parseLintOutput = (output: string): LintProblem[] => {
  const problems: LintProblem[] = [];
  for (const raw of output.replace(ANSI, "").split("\n")) {
    const match = CONCISE_LINE.exec(raw.trim());
    if (!match) continue;
    const [, level, file = "", line = "0", column = "0", message = ""] = match;
    problems.push({
      level: level === "Error" ? "error" : "warning",
      // Included files are named by their path in the container.
      file: file.replace(/^(\.\/|\/tmp\/project\/)/, ""),
      line: Number(line),
      column: Number(column),
      message: message.trim(),
    });
  }
  return problems;
};

/** The project for the container's stdin: `path<TAB>base64` per line. */
export const encodeProject = (files: Record<string, string>): string =>
  Object.entries(files)
    .map(([file, content]) => {
      if (/[\t\n\r]/.test(file)) throw new Error(`Not a usable file name: ${JSON.stringify(file)}`);
      return `${file}\t${Buffer.from(content, "utf8").toString("base64")}\n`;
    })
    .join("");

/** The shell words for a file name inside single quotes. */
const quote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

const isNfCoreFile = (file: string): boolean => /^(modules|subworkflows)\/nf-core\//.test(file);

/**
 * What a project's lint checks: its own scripts. nf-core's files are there
 * for the includes, but are nf-core's to fix, so they aren't linted.
 */
export const filesToLint = (project: AnalysisProject): string[] =>
  Object.keys(project.files)
    .filter((file) => file.endsWith(".nf") && !isNfCoreFile(file))
    .sort((a, b) => (a === project.entry ? -1 : b === project.entry ? 1 : a.localeCompare(b)));

export const buildLintDockerArgs = (image: string, containerName: string, files: string[]): string[] => [
  ...sandboxedRunArgs(containerName),
  "-e",
  "HOME=/tmp",
  "-e",
  "NXF_ANSI_LOG=false",
  // The image's entry script joins its arguments again, which breaks quoting.
  "--entrypoint",
  "sh",
  image,
  "-c",
  [
    "mkdir -p /tmp/project && cd /tmp/project",
    `while IFS="$(printf '\\t')" read -r path data; do mkdir -p "$(dirname "$path")"; printf '%s' "$data" | base64 -d > "$path"; done`,
    `nextflow lint -o concise ${files.map(quote).join(" ")}`,
  ].join(" && "),
];

export class LintUnavailableError extends Error {}

export const getLintStatus = (config = readLintConfig()) =>
  toolStatus(config, {
    off: "Nextflow's lint is switched off on this installation (NWAVE_LINT=off).",
    name: "Nextflow's lint",
  });

export const runNextflowLint = async (project: AnalysisProject, config = readLintConfig()): Promise<LintResult> => {
  const status = await getLintStatus(config);
  if (!status.available) throw new LintUnavailableError(status.reason);
  if (!status.imagePresent) await ensureImage(config.image, LintUnavailableError);
  const files = filesToLint(project);
  if (files.length === 0) return { tool: { name: "nextflow lint", image: config.image }, files, problems: [] };
  const containerName = `nwave-lint-${randomUUID().slice(0, 12)}`;
  const result = await runDocker(
    buildLintDockerArgs(config.image, containerName, files),
    encodeProject(project.files),
    config.timeoutSeconds * 1000,
    () => removeContainer(containerName)
  );
  if (result.timedOut) throw new Error(`Nextflow's lint took longer than ${config.timeoutSeconds} s and was stopped.`);
  const output = `${result.stdout}\n${result.stderr}`;
  // Warnings in nf-core's files (lint reads them through the includes) are
  // nf-core's to fix; an error there still keeps the workflow from working.
  const problems = parseLintOutput(output).filter((problem) => problem.level === "error" || !isNfCoreFile(problem.file));
  // Lint exits with 1 when it found errors; anything else without a finding failed.
  if (result.code !== 0 && problems.length === 0) {
    const reason = output.replace(ANSI, "").trim().split("\n").filter(Boolean).pop() || `exit code ${result.code}`;
    throw new Error(`Nextflow's lint failed: ${reason}`);
  }
  return { tool: { name: "nextflow lint", image: config.image }, files, problems };
};
