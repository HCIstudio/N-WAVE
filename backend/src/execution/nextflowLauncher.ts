// How Nextflow is started for a run: a host binary or the nextflow/nextflow
// container, and the command line for it.

import path from "node:path";
import {
  buildContainerNextflowCommand,
  buildLocalNextflowCommand,
  resolveNextflowPlatform,
  resolveRunnerDockerApiVersion,
  toDockerHostVisiblePath,
} from "./command";
import { ensureDockerAvailable, resolveContainerMount } from "./docker";
import { runnerContainerName } from "./runRegistry";
import type { RunProfile } from "./runProfile";
import { isCommandAvailable, readCommandOutput } from "./shell";

/**
 * How to run Nextflow, from NEXTFLOW_EXECUTION_MODE:
 *   "docker" — always in a container (nextflow/nextflow). The only host
 *              requirement is Docker itself; the Docker deployment sets this,
 *              so `docker compose up` is self-contained on any machine.
 *   "local"  — always a host `nextflow` binary.
 *   "auto"   — (dev default) a local binary when there is one, else a container.
 */
export const resolveExecutionMode = (
  value: string | undefined
): "docker" | "local" | "auto" => {
  const mode = (value || "auto").toLowerCase();
  return mode === "docker" || mode === "local" ? mode : "auto";
};

export const shouldUseLocalNextflow = async (
  mode: "docker" | "local" | "auto",
  hasLocalNextflow: () => Promise<boolean> = () =>
    isCommandAvailable("nextflow -version")
): Promise<boolean> => {
  if (mode === "docker") return false;
  if (mode === "local") return true;
  return hasLocalNextflow();
};

interface LaunchOptions {
  runId: string;
  runDir: string;
  /** e.g. "my_workflow"; the script is workflow/<name>.nf. */
  scriptName: string;
  scriptPath: string;
  pipeline?: {
    name: string;
    version: string;
    profiles: string[];
    withParamsFile: boolean;
  };
  hasNfCoreModules: boolean;
  useProcessDocker: boolean;
  maxCpus: number;
  maxMemory: string;
  nextflowVersion: string;
  /** Whether a pipeline needs a newer Nextflow than the one selected. */
  raisedNextflowVersion: boolean;
  /** Reuse the unchanged tasks of the folder's last run (-resume). */
  resume?: boolean;
  /** Nextflow's log, relative to the run directory. */
  nextflowLog?: string;
  /** Where the steps run (a run profile's executor); local when unset. */
  executor?: RunProfile["executor"];
}

export interface NextflowLaunch {
  command: string;
  /** Set when Nextflow runs in a container, to stop it on cancel. */
  containerName?: string;
}

const usedLocally = async (options: LaunchOptions): Promise<NextflowLaunch> => {
  console.log(
    `Using local Nextflow with Docker processes: ${options.useProcessDocker}`
  );
  if (options.useProcessDocker) {
    await ensureDockerAvailable(
      options.pipeline
        ? "nf-core pipelines run their steps in Docker containers"
        : options.hasNfCoreModules
          ? "nf-core modules require Docker process containers"
          : "Docker process execution is enabled"
    );
  }
  return {
    command: buildLocalNextflowCommand({
      // The Nextflow launcher switches versions through NXF_VER.
      nextflowVersion: options.raisedNextflowVersion
        ? options.nextflowVersion
        : undefined,
      scriptPath: path.relative(options.runDir, options.scriptPath),
      pipeline: options.pipeline,
      withModuleConfig: true,
      maxCpus: options.maxCpus,
      maxMemory: options.maxMemory,
      resume: options.resume,
      logFile: options.nextflowLog,
    }),
  };
};

/** The results folder inside the backend container (a volume in docker-compose). */
const CONTAINER_RESULTS = "/app/results";

/**
 * In the Docker setup the Nextflow runner only sees the results volume, so a
 * run's folder has to be inside it; elsewhere it would run in a folder that
 * doesn't exist for it.
 */
export const assertRunDirInContainerResults = (runDir: string): void => {
  const relative = path.posix.relative(CONTAINER_RESULTS, runDir.replace(/\\/g, "/"));
  if (relative.startsWith("..") || path.posix.isAbsolute(relative)) {
    throw new Error(
      `In the Docker setup, runs are written inside ${CONTAINER_RESULTS}, but this run's folder is ${runDir}. Set Output Directory in the execution settings to "results" or a folder inside it.`
    );
  }
};

const usedInContainer = async (
  options: LaunchOptions,
  mode: "docker" | "auto"
): Promise<NextflowLaunch> => {
  // Container mode needs a reachable Docker daemon. In docker-compose the
  // host Docker socket is mounted into the backend container.
  if (!(await isCommandAvailable("docker info"))) {
    throw new Error(
      mode === "docker"
        ? "Cannot execute workflow: Docker is not available. Ensure the Docker socket is mounted into the backend container (see docker-compose)."
        : "Cannot execute workflow: no local Nextflow found and Docker is not running. Start Docker and try again."
    );
  }
  assertRunDirInContainerResults(options.runDir);
  console.log(`Using Nextflow container: nextflow/nextflow:${options.nextflowVersion}`);

  // The runner shares the backend container's results volume.
  const backendContainerName = process.env.BACKEND_CONTAINER_NAME || "nwave-backend";
  const resultsMount = await resolveContainerMount(backendContainerName, CONTAINER_RESULTS);
  // When tasks run in Docker, run Nextflow from a path the host's Docker
  // daemon also sees. Otherwise sibling task containers get empty
  // /app/results mounts and cannot see .command.sh.
  const resultsRoot = options.useProcessDocker
    ? toDockerHostVisiblePath(resultsMount.source)
    : CONTAINER_RESULTS;
  const containerName = runnerContainerName(options.runId);
  const command = buildContainerNextflowCommand({
    dockerApiVersion: resolveRunnerDockerApiVersion(
      await readCommandOutput("docker version --format '{{.Server.MinAPIVersion}}'"),
      process.env.DOCKER_API_VERSION
    ),
    // A pipeline's bin/ scripts must be on a path the host's Docker sees
    // (task containers mount it); keep pipelines under results/.
    assetsDir:
      options.pipeline && options.useProcessDocker
        ? path.posix.join(resultsRoot, ".nextflow-assets")
        : undefined,
    scriptPath: path.posix.join("workflow", `${options.scriptName}.nf`),
    pipeline: options.pipeline,
    withModuleConfig: true,
    maxCpus: options.maxCpus,
    maxMemory: options.maxMemory,
    resume: options.resume,
    logFile: options.nextflowLog,
    // linux/amd64 by default (emulated on ARM hosts): many nextflow/nextflow
    // tags are amd64-only; see resolveNextflowPlatform for "native".
    platform: resolveNextflowPlatform(process.env.NEXTFLOW_PLATFORM),
    nextflowVersion: options.nextflowVersion,
    workDir: path.posix.join(
      resultsRoot,
      path.relative(CONTAINER_RESULTS, options.runDir).replace(/\\/g, "/")
    ),
    containerName,
    mount: options.useProcessDocker
      ? { type: "bind", source: resultsMount.source, target: resultsRoot }
      : { type: "volumes-from", container: backendContainerName },
  });
  return { command, containerName };
};

/**
 * A SLURM run's Nextflow submits each step with sbatch, so it has to run on
 * this server (not in the runner container, which can't reach a scheduler)
 * and sbatch has to be there.
 */
export const assertCanSubmitToSlurm = async (
  usesLocalNextflow: boolean,
  hasSbatch: () => Promise<boolean> = () => isCommandAvailable("sbatch --version")
): Promise<void> => {
  if (!usesLocalNextflow) {
    throw new Error(
      "Running through a SLURM profile needs Nextflow installed on the N-WAVE server (NEXTFLOW_EXECUTION_MODE=local), on a machine that can submit jobs. The Docker setup runs Nextflow in a container, which can't reach a scheduler; export the project and run it on the cluster instead."
    );
  }
  if (!(await hasSbatch())) {
    throw new Error(
      "Running through a SLURM profile needs sbatch on the N-WAVE server, and this server has none. Run N-WAVE where jobs can be submitted (a login node), or export the project and run it on the cluster."
    );
  }
};

/** The command that starts Nextflow for this run. */
export const buildNextflowLaunch = async (
  options: LaunchOptions
): Promise<NextflowLaunch> => {
  const mode = resolveExecutionMode(process.env.NEXTFLOW_EXECUTION_MODE);
  const local = await shouldUseLocalNextflow(mode);
  if (options.executor === "slurm") await assertCanSubmitToSlurm(local);
  if (local) return usedLocally(options);
  return usedInContainer(options, mode === "docker" ? "docker" : "auto");
};
