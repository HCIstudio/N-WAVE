// What the host's Docker and Nextflow can do: status checks for the
// settings dialog and the mounts a run's containers need.

import { exec } from "node:child_process";
import { DEFAULT_NEXTFLOW_VERSION, resolveNextflowPlatform, shellQuote } from "./command";
import { execOutput, isCommandAvailable } from "./shell";

/** Throws, naming the reason Docker is needed, when Docker isn't running. */
export const ensureDockerAvailable = async (reason: string): Promise<void> => {
  if (!(await isCommandAvailable("docker info"))) {
    throw new Error(
      `${reason}, but Docker is not available. Please start Docker Desktop and try again.`
    );
  }
};

/** Where a container's mount at `destination` comes from on the host. */
export const resolveContainerMount = async (
  containerName: string,
  destination: string
): Promise<{ source: string; destination: string }> => {
  const mountsJson = await execOutput(
    `docker inspect ${shellQuote(containerName)} --format '{{json .Mounts}}'`
  );
  const mounts = JSON.parse(mountsJson) as Array<{
    Source?: string;
    Destination?: string;
  }>;
  const mount = mounts.find((entry) => entry.Destination === destination);
  if (!mount?.Source || !mount.Destination) {
    throw new Error(
      `Could not resolve Docker mount for ${destination} in ${containerName}`
    );
  }
  return { source: mount.Source, destination: mount.Destination };
};

const run = (command: string, timeout = 0) =>
  new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve) =>
    exec(command, { timeout }, (error, stdout, stderr) =>
      resolve({
        ok: !error,
        stdout: String(stdout),
        stderr: String(stderr) || (error?.killed ? "timed out" : ""),
      })
    )
  );

/** Whether Docker is installed and its daemon running, with why not. */
export const getDockerStatus = async () => {
  const cli = await run("docker --version");
  if (!cli.ok) {
    return {
      dockerAvailable: false,
      error: "Docker not found",
      details: cli.stderr,
    };
  }
  const version = cli.stdout.trim();
  const daemon = await run("docker info");
  if (daemon.ok) return { dockerAvailable: true, version };
  // Docker Desktop installed but not started (Windows and macOS).
  if (
    daemon.stderr.includes("dockerDesktopLinuxEngine") ||
    daemon.stderr.includes("pipe/docker_engine") ||
    daemon.stderr.includes("cannot connect to the Docker daemon")
  ) {
    return {
      dockerAvailable: false,
      error: "Docker Desktop not running",
      details:
        "Docker Desktop needs to be started. Please launch Docker Desktop and try again.",
      version,
    };
  }
  return {
    dockerAvailable: false,
    error: "Docker daemon not accessible",
    details: daemon.stderr,
    version,
  };
};

/** Whether Nextflow runs here, locally or in its container. */
export const getNextflowStatus = async () => {
  const local = await run("nextflow -version");
  if (local.ok) {
    return {
      nextflowAvailable: true,
      dockerNextflowAvailable: true,
      version: local.stdout.trim(),
    };
  }
  // The image runs use (on the same platform); the first check downloads it.
  const platform = resolveNextflowPlatform(process.env.NEXTFLOW_PLATFORM);
  const docker = await run(
    `docker run --rm${platform ? ` --platform ${shellQuote(platform)}` : ""} nextflow/nextflow:${DEFAULT_NEXTFLOW_VERSION} nextflow -version`,
    5 * 60_000
  );
  if (!docker.ok) {
    // Docker runs but couldn't start the image (no network, a registry limit):
    // runs can still download it, and their log then shows why they can't.
    if ((await run("docker info", 30_000)).ok) {
      return {
        nextflowAvailable: false,
        dockerNextflowAvailable: true,
        note: "Nextflow runs in Docker, but its image couldn't be started yet",
        details: docker.stderr.trim(),
      };
    }
    return {
      nextflowAvailable: false,
      dockerNextflowAvailable: false,
      error: "Nextflow not found locally or via Docker",
      details: docker.stderr.trim() || local.stderr,
    };
  }
  return {
    nextflowAvailable: false,
    dockerNextflowAvailable: true,
    version: docker.stdout.trim(),
    note: "Nextflow available via Docker",
  };
};
