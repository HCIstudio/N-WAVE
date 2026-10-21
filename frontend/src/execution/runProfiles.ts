// Run profiles: where a workflow's steps run (this computer, a SLURM cluster
// or AWS Batch), with which container engine and default resources. Each
// becomes a Nextflow profile in exported projects (`-profile <name>`); a
// SLURM or local one can also run workflows from N-WAVE. Mirrored by
// backend/src/execution/runProfile.ts, which builds the config for runs.

export type RunExecutor = "local" | "slurm" | "awsbatch";
export type ContainerEngine = "docker" | "singularity" | "apptainer" | "none";

export interface RunProfile {
  /** The Nextflow profile name, e.g. "slurm". */
  name: string;
  executor: RunExecutor;
  /** SLURM partition, or AWS Batch job queue. */
  queue?: string;
  containerEngine: ContainerEngine;
  /** Defaults for steps that don't set their own. */
  cpus?: number;
  /** e.g. "4 GB". */
  memory?: string;
  /** e.g. "2h". */
  time?: string;
  /** Extra sbatch options, e.g. "--account=lab". */
  clusterOptions?: string;
  /** How many jobs may be queued at once. */
  queueSize?: number;
  /** AWS Batch: the region, e.g. "eu-west-1". */
  awsRegion?: string;
  /** AWS Batch: the S3 work directory, e.g. "s3://bucket/work". */
  workDir?: string;
}

export const EXECUTOR_LABELS: Record<RunExecutor, string> = {
  local: "This computer",
  slurm: "SLURM cluster",
  awsbatch: "AWS Batch",
};

export const CONTAINER_ENGINE_LABELS: Record<ContainerEngine, string> = {
  docker: "Docker",
  singularity: "Singularity",
  apptainer: "Apptainer",
  none: "None (tools installed where steps run)",
};

/** Starting points for a new profile. */
export const RUN_PROFILE_PRESETS: Record<RunExecutor, RunProfile> = {
  local: { name: "local_singularity", executor: "local", containerEngine: "singularity" },
  slurm: {
    name: "slurm",
    executor: "slurm",
    containerEngine: "singularity",
    cpus: 2,
    memory: "4 GB",
    time: "2h",
    queueSize: 50,
  },
  awsbatch: {
    name: "awsbatch",
    executor: "awsbatch",
    containerEngine: "docker",
    queue: "",
    awsRegion: "",
    workDir: "",
  },
};

/** The profile exported projects always have. */
export const BUILT_IN_PROFILE = "docker";

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const QUEUE = /^[A-Za-z0-9_.:/@-]{1,256}$/;
const MEMORY = /^\d+(\.\d+)?\s*\.?\s*(KB|MB|GB|TB)$/i;
const TIME = /^\d+(\.\d+)?\s*(s|m|h|d)$/;
const REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;
const S3_PATH = /^s3:\/\/[a-z0-9][a-z0-9.-]{1,62}(\/[A-Za-z0-9_.\-/]*)?$/;
// Options go into a single-quoted config string: no quotes, backslashes or
// line breaks.
const CLUSTER_OPTIONS = /^[^'\\\n\r]{1,500}$/;

/** What is wrong with a profile, one line each; [] when it can be used. */
export const findProfileProblems = (
  profile: RunProfile,
  others: RunProfile[] = [],
): string[] => {
  const problems: string[] = [];
  if (!NAME.test(profile.name)) {
    problems.push(
      "The name must start with a letter and use only letters, digits and _ (up to 40).",
    );
  } else if (profile.name === BUILT_IN_PROFILE) {
    problems.push(`"${BUILT_IN_PROFILE}" is the built-in profile; choose another name.`);
  } else if (others.some((other) => other !== profile && other.name === profile.name)) {
    problems.push(`Another profile is called "${profile.name}".`);
  }
  if (profile.queue && !QUEUE.test(profile.queue)) {
    problems.push("The queue may only use letters, digits and _ . : / @ -.");
  }
  if (profile.cpus !== undefined && !(Number.isInteger(profile.cpus) && profile.cpus >= 1 && profile.cpus <= 1024)) {
    problems.push("CPUs must be a whole number from 1 to 1024.");
  }
  if (profile.memory && !MEMORY.test(profile.memory.trim())) {
    problems.push('Memory must be like "4 GB" or "500 MB".');
  }
  if (profile.time && !TIME.test(profile.time.trim())) {
    problems.push('Time must be like "30m", "2h" or "1d".');
  }
  if (profile.queueSize !== undefined && !(Number.isInteger(profile.queueSize) && profile.queueSize >= 1 && profile.queueSize <= 10_000)) {
    problems.push("Jobs at once must be a whole number from 1 to 10000.");
  }
  if (profile.clusterOptions && !CLUSTER_OPTIONS.test(profile.clusterOptions)) {
    problems.push("Cluster options can't contain quotes, backslashes or line breaks.");
  }
  if (profile.executor === "awsbatch") {
    if (!profile.queue) problems.push("AWS Batch needs a job queue.");
    if (!profile.awsRegion || !REGION.test(profile.awsRegion)) {
      problems.push('AWS Batch needs a region, like "eu-west-1".');
    }
    if (!profile.workDir || !S3_PATH.test(profile.workDir)) {
      problems.push('AWS Batch needs an S3 work directory, like "s3://my-bucket/work".');
    }
    if (profile.containerEngine !== "docker") {
      problems.push("AWS Batch runs steps in Docker containers.");
    }
  }
  return problems;
};

/** The problems of each profile that has any. */
export const findProfilesProblems = (profiles: RunProfile[]): Map<RunProfile, string[]> =>
  new Map(
    profiles
      .map((profile) => [profile, findProfileProblems(profile, profiles)] as const)
      .filter(([, problems]) => problems.length > 0),
  );

const quoted = (value: string): string => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

const containerLines = (engine: ContainerEngine): string[] => {
  switch (engine) {
    case "docker":
      return [
        "docker.enabled = true",
        "docker.runOptions = '-u $(id -u):$(id -g)'",
      ];
    case "singularity":
      return ["docker.enabled = false", "singularity.enabled = true", "singularity.autoMounts = true"];
    case "apptainer":
      return ["docker.enabled = false", "apptainer.enabled = true", "apptainer.autoMounts = true"];
    case "none":
      return ["docker.enabled = false"];
  }
};

/** The settings of one profile, one Nextflow config line each. */
export const buildProfileLines = (profile: RunProfile): string[] => [
  `process.executor = ${quoted(profile.executor)}`,
  ...(profile.queue ? [`process.queue = ${quoted(profile.queue)}`] : []),
  ...(profile.executor === "slurm" && profile.clusterOptions
    ? [`process.clusterOptions = ${quoted(profile.clusterOptions)}`]
    : []),
  ...(profile.cpus !== undefined ? [`process.cpus = ${profile.cpus}`] : []),
  ...(profile.memory ? [`process.memory = ${quoted(profile.memory.trim())}`] : []),
  ...(profile.time ? [`process.time = ${quoted(profile.time.trim())}`] : []),
  ...(profile.queueSize !== undefined ? [`executor.queueSize = ${profile.queueSize}`] : []),
  ...(profile.executor === "awsbatch"
    ? [
        ...(profile.awsRegion ? [`aws.region = ${quoted(profile.awsRegion)}`] : []),
        ...(profile.workDir ? [`workDir = ${quoted(profile.workDir)}`] : []),
      ]
    : []),
  ...containerLines(profile.containerEngine),
];

/** The profiles that can be used: those without problems. */
export const usableProfiles = (profiles: RunProfile[]): RunProfile[] =>
  profiles.filter((profile) => findProfileProblems(profile, profiles).length === 0);

/**
 * The `profiles { … }` block of an exported project: the built-in Docker
 * profile (unless the project is an nf-core pipeline, which has its own) and
 * the workflow's own profiles (those with problems are left out).
 */
export const buildProfilesBlock = (
  profiles: RunProfile[] = [],
  { builtIn = true }: { builtIn?: boolean } = {},
): string => {
  const usable = usableProfiles(profiles);
  const block = (name: string, lines: string[]) => [
    `  ${name} {`,
    ...lines.map((line) => `    ${line}`),
    "  }",
  ];
  return [
    "profiles {",
    ...(builtIn
      ? block(BUILT_IN_PROFILE, [
          "docker.enabled = true",
          "// Run as the calling user, so outputs aren't owned by root and",
          "// images with a non-root default user can write to the task dir.",
          "docker.runOptions = '-u $(id -u):$(id -g)'",
        ])
      : []),
    ...usable.flatMap((profile) => block(profile.name, buildProfileLines(profile))),
    "}",
  ].join("\n");
};

/** One line saying where a profile runs steps, for READMEs and the settings. */
export const describeProfile = (profile: RunProfile): string =>
  [
    EXECUTOR_LABELS[profile.executor],
    profile.queue ? `queue ${profile.queue}` : null,
    profile.containerEngine === "none" ? "no containers" : CONTAINER_ENGINE_LABELS[profile.containerEngine],
  ]
    .filter(Boolean)
    .join(", ");

/** Whether N-WAVE can run workflows through the profile itself (not only export it). */
export const canRunFromNwave = (profile: RunProfile): boolean => profile.executor !== "awsbatch";
