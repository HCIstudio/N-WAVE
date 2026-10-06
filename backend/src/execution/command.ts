// Pure helpers that build the shell command used to launch Nextflow. Every
// value interpolated into a command passes through shellQuote or has been
// validated by the request schema (src/validation/schemas.ts).

export const DEFAULT_NEXTFLOW_VERSION = "25.04.4";

/** Upper bound on the memory handed to Nextflow, for host safety. */
const MAX_MEMORY_GB = 5;

export const shellQuote = (value: string): string =>
  `'${value.replace(/'/g, "'\\''")}'`;

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

/** Cap a Nextflow memory string (e.g. "8 GB") at MAX_MEMORY_GB. */
export const capMaxMemory = (maxMemory: string | undefined): string => {
  const memory = maxMemory || "4GB";
  if (!memory.includes("GB")) return memory;

  const value = Number.parseFloat(memory.replace(/[^\d.]/g, ""));
  return value > MAX_MEMORY_GB ? `${MAX_MEMORY_GB}GB` : memory;
};

export const normalizeMaxCpus = (maxCpus: number | undefined): number =>
  Math.max(1, Number(maxCpus) || 4);

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

interface NextflowRunOptions {
  /** Script path relative to the run directory. */
  scriptPath: string;
  /** True when a generated nwave_modules.config should be passed with -c. */
  withModuleConfig: boolean;
  maxCpus: number;
  maxMemory: string;
}

const buildNextflowRunArgs = ({
  scriptPath,
  withModuleConfig,
  maxCpus,
  maxMemory,
}: NextflowRunOptions): string => {
  const configOption = withModuleConfig ? "-c nwave_modules.config " : "";
  return `nextflow -log nextflow/.nextflow.log ${configOption}run ./${scriptPath} --outdir results --inputdir inputs --max_cpus ${maxCpus} --max_memory ${shellQuote(maxMemory)} -work-dir nextflow/work`;
};

/** Command for a Nextflow binary installed on the host. */
export const buildLocalNextflowCommand = (options: NextflowRunOptions): string =>
  `NXF_LOG_FILE=nextflow/.nextflow.log ${buildNextflowRunArgs(options)}`;

interface ContainerNextflowOptions extends NextflowRunOptions {
  /** Docker platform for the runner, e.g. linux/amd64; null for native. */
  platform: string | null;
  nextflowVersion: string;
  /** Run directory as seen from inside the runner container. */
  workDir: string;
  /** Either a `-v host:container` bind or `--volumes-from <container>`. */
  mount: { type: "bind"; source: string; target: string } | {
    type: "volumes-from";
    container: string;
  };
}

/** Command that runs Nextflow inside the official nextflow/nextflow image. */
export const buildContainerNextflowCommand = (
  options: ContainerNextflowOptions
): string => {
  const mount =
    options.mount.type === "bind"
      ? `-v ${shellQuote(`${options.mount.source}:${options.mount.target}`)}`
      : `--volumes-from ${shellQuote(options.mount.container)}`;

  const platform = options.platform
    ? ` --platform ${shellQuote(options.platform)}`
    : "";

  return `docker run --rm${platform} ${mount} -v /var/run/docker.sock:/var/run/docker.sock -e NXF_LOG_FILE=nextflow/.nextflow.log -w ${shellQuote(options.workDir)} ${shellQuote(`nextflow/nextflow:${options.nextflowVersion}`)} ${buildNextflowRunArgs(options)}`;
};
