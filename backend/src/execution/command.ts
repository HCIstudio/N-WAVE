// Pure helpers that build the shell command used to launch Nextflow. Every
// value interpolated into a command passes through shellQuote or has been
// validated by the request schema (src/validation/schemas.ts).

export const DEFAULT_NEXTFLOW_VERSION = "25.04.4";

export const shellQuote = (value: string): string =>
  `'${value.replace(/'/g, "'\\''")}'`;

/** A path as one shell word: as is when it is plain, quoted otherwise. */
const shellPath = (value: string): string =>
  /^[\w./-]+$/.test(value) ? value : shellQuote(value);

/**
 * Translate a host path reported by `docker inspect` into a path the Docker
 * daemon can mount. Windows paths (Docker Desktop) live under
 * /run/desktop/mnt/host/<drive>/.
 */
export const toDockerHostVisiblePath = (hostPath: string): string => {
  const windowsPathMatch = hostPath.match(/^([A-Za-z]):\\(.*)$/);
  if (!windowsPathMatch) {
    return hostPath.replace(/\\/g, "/");
  }

  const drive = (windowsPathMatch[1] ?? "").toLowerCase();
  const rest = (windowsPathMatch[2] ?? "").replace(/\\/g, "/");
  return `/run/desktop/mnt/host/${drive}/${rest}`;
};

/** Reduce a workflow name to characters that are safe in file names. */
export const sanitizeWorkflowName = (workflowName: string): string =>
  workflowName.replace(/[^a-zA-Z0-9_-]/g, "_") || "workflow";

/**
 * Expand an output naming pattern such as "{workflow_name}_{timestamp}".
 * Supported placeholders: {workflow_name}, {process_name}, {timestamp}, {date}.
 */
export const resolveOutputName = (
  pattern: string | undefined,
  workflowName: string,
  now: Date = new Date()
): string => {
  const outputNaming = pattern || "{workflow_name}";
  const dateStr = now.toISOString().split("T")[0] ?? "";

  return outputNaming
    .replace(/\{workflow_name\}/g, workflowName)
    .replace(/\{timestamp\}/g, String(now.getTime()))
    .replace(/\{date\}/g, dateStr)
    .replace(/\{process_name\}/g, workflowName);
};

/**
 * Platform for the Nextflow runner container, from NEXTFLOW_PLATFORM.
 * Defaults to linux/amd64 because many nextflow/nextflow tags are published
 * for amd64 only (ARM hosts then run it under emulation). "native" (or an
 * empty value) drops the --platform flag so Docker picks the host
 * architecture, for Nextflow versions that publish an arm64 image.
 */
export const resolveNextflowPlatform = (
  configured: string | undefined
): string | null => {
  if (configured === undefined) return "linux/amd64";
  const value = configured.trim();
  return value === "" || value.toLowerCase() === "native" ? null : value;
};

/** A whole nf-core pipeline to run instead of a generated script. */
export interface PipelineTarget {
  /** nf-core pipeline name, e.g. "rnaseq" (validated by the request schema). */
  name: string;
  /** Release tag or branch, e.g. "3.27.0". */
  version: string;
  /** Config profiles, e.g. ["test", "docker"]. */
  profiles: string[];
  /** True when a params.json in the run directory should be passed. */
  withParamsFile: boolean;
}

interface NextflowRunOptions {
  /** Script path relative to the run directory. */
  scriptPath: string;
  /** Run this nf-core pipeline instead of the script. */
  pipeline?: PipelineTarget;
  /** True when a generated nwave_modules.config should be passed with -c. */
  withModuleConfig: boolean;
  maxCpus: number;
  maxMemory: string;
  /** Reuse the tasks of the folder's last run that are unchanged (-resume). */
  resume?: boolean;
  /** Nextflow's log, relative to the run directory. */
  logFile?: string;
}

/** Where Nextflow writes its log, unless the run names its own. */
export const DEFAULT_NEXTFLOW_LOG = "nextflow/.nextflow.log";

const buildNextflowRunArgs = ({
  scriptPath,
  pipeline,
  withModuleConfig,
  maxCpus,
  maxMemory,
  resume = false,
  logFile = DEFAULT_NEXTFLOW_LOG,
}: NextflowRunOptions): string => {
  const configOption = withModuleConfig ? "-c nwave_modules.config " : "";
  const log = `-log ${shellPath(logFile)}`;
  const resumeOption = resume ? " -resume" : "";
  if (pipeline) {
    // Pipelines declare their own params; resources are capped by the run's
    // config (process.resourceLimits, see resources.ts).
    const paramsFile = pipeline.withParamsFile ? " -params-file params.json" : "";
    return `nextflow ${log} ${configOption}run ${shellQuote(`nf-core/${pipeline.name}`)} -r ${shellQuote(pipeline.version)} -profile ${shellQuote(pipeline.profiles.join(","))}${paramsFile} --outdir results -work-dir nextflow/work${resumeOption}`;
  }
  return `nextflow ${log} ${configOption}run ./${scriptPath} --outdir results --inputdir inputs --max_cpus ${maxCpus} --max_memory ${shellQuote(maxMemory)} -work-dir nextflow/work${resumeOption}`;
};

/**
 * Command for a Nextflow binary installed on the host. `nextflowVersion`
 * makes the launcher use that version (NXF_VER), e.g. when a pipeline needs
 * a newer one.
 */
export const buildLocalNextflowCommand = (
  options: NextflowRunOptions & { nextflowVersion?: string; locale?: string | null }
): string =>
  `${options.locale ? `LC_ALL=${shellQuote(options.locale)} ` : ""}${options.nextflowVersion ? `NXF_VER=${shellQuote(options.nextflowVersion)} ` : ""}NXF_LOG_FILE=${shellPath(options.logFile ?? DEFAULT_NEXTFLOW_LOG)} ${buildNextflowRunArgs(options)}`;

/**
 * The locale a local Nextflow needs, or null when the server's is fine:
 * without a UTF-8 one, Java can't open input files with non-ASCII names
 * ("Malformed input or input contains unmappable characters").
 */
export const localeForNextflow = (env: NodeJS.ProcessEnv): string | null =>
  /utf-?8/i.test(env.LC_ALL || env.LC_CTYPE || env.LANG || "") ? null : "C.UTF-8";

interface ContainerNextflowOptions extends NextflowRunOptions {
  /** Docker platform for the runner, e.g. linux/amd64; null for native. */
  platform: string | null;
  nextflowVersion: string;
  /** Run directory as seen from inside the runner container. */
  workDir: string;
  /** Container name, so a cancelled run's container can be stopped. */
  containerName?: string;
  /**
   * Docker API version for the runner's own docker CLI, which starts the task
   * containers (see resolveRunnerDockerApiVersion); null leaves it alone.
   */
  dockerApiVersion?: string | null;
  /**
   * Where Nextflow keeps downloaded pipelines (NXF_ASSETS). It must be a
   * path the Docker host sees too: Nextflow mounts a pipeline's bin/ into
   * each task container, and the default ($HOME/.nextflow/assets inside the
   * runner) reaches the host's daemon as an empty folder.
   */
  assetsDir?: string;
  /** Pass the backend's GITHUB_TOKEN on, for downloading pipelines. */
  passGithubToken?: boolean;
  /** Either a bind mount (`--mount type=bind`) or `--volumes-from <container>`. */
  mount: { type: "bind"; source: string; target: string } | {
    type: "volumes-from";
    container: string;
  };
}

/** A `--mount` field; values with a comma or quote are quoted, CSV style. */
const mountField = (key: string, value: string): string =>
  /[",]/.test(value) ? `"${key}=${value.replace(/"/g, '""')}"` : `${key}=${value}`;

/** Command that runs Nextflow inside the official nextflow/nextflow image. */
export const buildContainerNextflowCommand = (
  options: ContainerNextflowOptions
): string => {
  // --mount, not -v: a source with a colon (C:\Users\…) breaks `-v src:dst`.
  const mount =
    options.mount.type === "bind"
      ? `--mount ${shellQuote(
          `type=bind,${mountField("source", options.mount.source)},${mountField("target", options.mount.target)}`
        )}`
      : `--volumes-from ${shellQuote(options.mount.container)}`;

  const platform = options.platform
    ? ` --platform ${shellQuote(options.platform)}`
    : "";

  const name = options.containerName
    ? ` --name ${shellQuote(options.containerName)}`
    : "";

  const apiVersion = options.dockerApiVersion
    ? ` -e DOCKER_API_VERSION=${shellQuote(options.dockerApiVersion)}`
    : "";
  const assets = options.assetsDir
    ? ` -e NXF_ASSETS=${shellQuote(options.assetsDir)}`
    : "";
  // `-e NAME` without a value passes the variable on without showing it.
  const githubToken = options.passGithubToken ? " -e GITHUB_TOKEN" : "";

  return `docker run --rm${name}${platform} ${mount} -v /var/run/docker.sock:/var/run/docker.sock${apiVersion}${assets}${githubToken} -e NXF_LOG_FILE=${shellPath(options.logFile ?? DEFAULT_NEXTFLOW_LOG)} -w ${shellQuote(options.workDir)} ${shellQuote(`nextflow/nextflow:${options.nextflowVersion}`)} ${buildNextflowRunArgs(options)}`;
};

/** Docker API version of the CLI in the nextflow/nextflow images (17.09). */
export const RUNNER_DOCKER_CLI_API = "1.32";

const compareApiVersions = (a: string, b: string): number => {
  const [aMajor = 0, aMinor = 0] = a.split(".").map(Number);
  const [bMajor = 0, bMinor = 0] = b.split(".").map(Number);
  return aMajor - bMajor || aMinor - bMinor;
};

/**
 * Docker API version the Nextflow runner's CLI should use.
 *
 * The nextflow/nextflow images ship docker CLI 17.09 (API 1.32). Docker
 * Engine 29 (current Docker Desktop) rejects clients older than API 1.40, so
 * every task container fails with "client version 1.32 is too old". The old
 * CLI works when told to use the engine's minimum version, so that is used
 * whenever it is newer than 1.32. `configured` (DOCKER_API_VERSION on the
 * backend) wins; null means the CLI's own version is fine.
 */
export const resolveRunnerDockerApiVersion = (
  engineMinApiVersion: string | undefined,
  configured?: string
): string | null => {
  const isVersion = (value: string | undefined): value is string =>
    /^\d+\.\d+$/.test(value?.trim() ?? "");
  if (isVersion(configured)) return configured.trim();
  if (!isVersion(engineMinApiVersion)) return null;
  const minimum = engineMinApiVersion.trim();
  return compareApiVersions(minimum, RUNNER_DOCKER_CLI_API) > 0 ? minimum : null;
};
