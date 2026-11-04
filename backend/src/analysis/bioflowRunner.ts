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
import { isCommandAvailable } from "../execution/shell";
import type { AnalysisProject } from "./bioflowProject";
import { ensureImage, imagePresent, removeContainer, runDocker } from "./dockerRun";
import { type BioflowResult, parseBioflowResult } from "./bioflowResult";

export const BIOFLOW_IMAGE_REPOSITORY = "hcistudio/nwave-bioflow";
const DEFAULT_TIMEOUT_SECONDS = 120;

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

export interface BioflowConfig {
  enabled: boolean;
  image: string;
  timeoutSeconds: number;
}

export const readBioflowConfig = (env: NodeJS.ProcessEnv = process.env): BioflowConfig => {
  const switchValue = (env.NWAVE_BIOFLOW ?? "").trim().toLowerCase();
  const timeout = Number(env.NWAVE_BIOFLOW_TIMEOUT);
  const version = nwaveVersion();
  return {
    enabled: !["off", "false", "no", "0"].includes(switchValue),
    image: env.NWAVE_BIOFLOW_IMAGE?.trim() || `${BIOFLOW_IMAGE_REPOSITORY}:${version ?? "latest"}`,
    timeoutSeconds: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_SECONDS,
  };
};

/** The `docker run` arguments for one analysis. */
export const buildBioflowDockerArgs = (image: string, containerName: string): string[] => [
  "run",
  "--rm",
  "-i",
  "--name",
  containerName,
  "--network",
  "none",
  "--read-only",
  "--tmpfs",
  "/tmp:rw,size=512m",
  "--cap-drop",
  "ALL",
  "--security-opt",
  "no-new-privileges",
  "--memory",
  "2g",
  "--cpus",
  "2",
  "--pids-limit",
  "512",
  "--pull",
  "never",
  image,
  "--stdin",
];

export interface BioflowStatus {
  available: boolean;
  image: string;
  /** The image is on this machine (else the first analysis downloads it). */
  imagePresent: boolean;
  /** Why the analysis isn't available. */
  reason?: string;
}

export const getBioflowStatus = async (config = readBioflowConfig()): Promise<BioflowStatus> => {
  if (!config.enabled) {
    return { available: false, image: config.image, imagePresent: false, reason: "The analysis is switched off on this installation (NWAVE_BIOFLOW=off)." };
  }
  if (!(await isCommandAvailable("docker info"))) {
    return { available: false, image: config.image, imagePresent: false, reason: "The analysis runs in Docker, and Docker is not available." };
  }
  return { available: true, image: config.image, imagePresent: await imagePresent(config.image) };
};

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
