// Running a one-off container for an analysis (BioFlow-Insight, nextflow
// lint): the input goes in on stdin, the output comes back on stdout, with a
// time limit and a cap on the output.

import { isCommandAvailable } from "../execution/shell";
import { spawn } from "node:child_process";

/** The most an analysis may print; more is not a result. */
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const PULL_TIMEOUT_MS = 15 * 60_000;

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Runs docker with `args`, writing `input` to its stdin. */
export const runDocker = (args: string[], input: string | null, timeoutMs: number, onTimeout?: () => void) =>
  new Promise<CommandResult>((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      onTimeout?.();
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) child.kill("SIGKILL");
      else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr, timedOut });
    });
    child.stdin.on("error", () => {
      // The container ended before reading everything; its exit says why.
    });
    child.stdin.end(input ?? "");
  });

/** Whether `image` is on this machine. */
export const imagePresent = async (image: string): Promise<boolean> =>
  (await runDocker(["image", "inspect", "--format", "{{.Id}}", image], null, 30_000)).code === 0;

/**
 * Download `image` when it isn't here: the backend downloads it, the
 * analysis itself never has network. Throws `Unavailable` when it can't.
 */
export const ensureImage = async (image: string, Unavailable: new (message: string) => Error): Promise<void> => {
  if (await imagePresent(image)) return;
  const pull = await runDocker(["pull", image], null, PULL_TIMEOUT_MS);
  if (pull.code !== 0) {
    throw new Unavailable(`The image ${image} could not be downloaded: ${pull.stderr.trim().split("\n").pop() ?? ""}`);
  }
};

/** Remove a container (an analysis that ran out of time). */
export const removeContainer = (name: string): void => {
  spawn("docker", ["rm", "-f", name], { stdio: "ignore" }).on("error", () => {});
};

/**
 * `docker run` for an analysis tool: no network, a read-only file system
 * (a small /tmp), no capabilities, capped memory, CPUs and processes, and
 * only an image already on this machine. The project goes in on stdin.
 */
export const sandboxedRunArgs = (containerName: string): string[] => [
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
];

export interface ToolConfig {
  enabled: boolean;
  image: string;
  timeoutSeconds: number;
}

/** A tool's settings: `<PREFIX>=off` switches it off, `<PREFIX>_IMAGE` and `<PREFIX>_TIMEOUT` (seconds). */
export const readToolConfig = (env: NodeJS.ProcessEnv, prefix: string, defaultImage: string): ToolConfig => {
  const timeout = Number(env[`${prefix}_TIMEOUT`]);
  return {
    enabled: !["off", "false", "no", "0"].includes((env[prefix] ?? "").trim().toLowerCase()),
    image: env[`${prefix}_IMAGE`]?.trim() || defaultImage,
    timeoutSeconds: Number.isFinite(timeout) && timeout > 0 ? timeout : 120,
  };
};

export interface ToolStatus {
  available: boolean;
  image: string;
  /** The image is on this machine (else the first use downloads it). */
  imagePresent: boolean;
  /** Why the tool isn't available. */
  reason?: string;
}

/** Whether a tool can run: switched on, with Docker. `what` names it for the reasons. */
export const toolStatus = async (config: ToolConfig, what: { off: string; name: string }): Promise<ToolStatus> => {
  if (!config.enabled) return { available: false, image: config.image, imagePresent: false, reason: what.off };
  if (!(await isCommandAvailable("docker info"))) {
    return { available: false, image: config.image, imagePresent: false, reason: `${what.name} runs in Docker, and Docker is not available.` };
  }
  return { available: true, image: config.image, imagePresent: await imagePresent(config.image) };
};
