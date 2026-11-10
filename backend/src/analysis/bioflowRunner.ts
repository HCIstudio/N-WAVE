// Runs the BioFlow-Insight analysis image (backend/bioflow) on a project.
// The project goes to the container on stdin and the result comes back on
// stdout, so the container sees none of N-WAVE's files. It runs without
// network, with a read-only file system, no capabilities, capped memory and
// CPUs, and a time limit.
//
//   NWAVE_BIOFLOW=off            no analysis (N-WAVE says it isn't available)
//   NWAVE_BIOFLOW_IMAGE=…        the image (default hcistudio/nwave-bioflow:<N-WAVE's version>)
//   NWAVE_BIOFLOW_TIMEOUT=120    time limit in seconds

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AnalysisProject } from "./bioflowProject";
import {
  ensureImage,
  readToolConfig,
  removeContainer,
  runDocker,
  sandboxedRunArgs,
  type ToolConfig,
  type ToolStatus,
  toolStatus,
} from "./dockerRun";
import { type BioflowResult, parseBioflowResult } from "./bioflowResult";

export const BIOFLOW_IMAGE_REPOSITORY = "hcistudio/nwave-bioflow";

/** N-WAVE's version, from the backend's package.json. */
const nwaveVersion = (): string | null => {
  for (const candidate of [
    path.join(__dirname, "..", "..", "package.json"),
    path.join(process.cwd(), "package.json"),
  ]) {
    try {
      const { version } = JSON.parse(fs.readFileSync(candidate, "utf8")) as { version?: string };
      if (version) return version;
    } catch {
      // Not there; try the next.
    }
  }
  return null;
};

export type BioflowConfig = ToolConfig;

export const readBioflowConfig = (env: NodeJS.ProcessEnv = process.env): BioflowConfig =>
  readToolConfig(env, "NWAVE_BIOFLOW", `${BIOFLOW_IMAGE_REPOSITORY}:${nwaveVersion() ?? "latest"}`);

/** The `docker run` arguments for one analysis. */
export const buildBioflowDockerArgs = (image: string, containerName: string): string[] => [
  ...sandboxedRunArgs(containerName),
  image,
  "--stdin",
];

export type BioflowStatus = ToolStatus;

export const getBioflowStatus = (config = readBioflowConfig()): Promise<BioflowStatus> =>
  toolStatus(config, {
    off: "The analysis is switched off on this installation (NWAVE_BIOFLOW=off).",
    name: "The analysis",
  });

export class BioflowUnavailableError extends Error {}

/** Analyse `project`; throws BioflowUnavailableError when the analysis can't run. */
export const runBioflowAnalysis = async (
  project: AnalysisProject,
  config = readBioflowConfig()
): Promise<BioflowResult> => {
  const status = await getBioflowStatus(config);
  if (!status.available) throw new BioflowUnavailableError(status.reason);
  if (!status.imagePresent) await ensureImage(config.image, BioflowUnavailableError);
  const containerName = `nwave-bioflow-${randomUUID().slice(0, 12)}`;
  const result = await runDocker(
    buildBioflowDockerArgs(config.image, containerName),
    JSON.stringify(project),
    config.timeoutSeconds * 1000,
    // Killing the docker client leaves the container running.
    () => removeContainer(containerName)
  );
  if (result.timedOut) {
    throw new Error(`The analysis took longer than ${config.timeoutSeconds} s and was stopped.`);
  }
  if (result.code !== 0) {
    const reason = result.code === 137 ? "it ran out of memory" : result.stderr.trim().split("\n").pop() || `exit code ${result.code}`;
    throw new Error(`The analysis failed: ${reason}`);
  }
  return parseBioflowResult(result.stdout);
};
