import { describe, expect, it } from "vitest";
import {
  buildProfileLines,
  buildProfilesBlock,
  describeProfile,
  findProfileProblems,
  RUN_PROFILE_PRESETS,
  type RunProfile,
} from "./runProfiles";

const slurm: RunProfile = {
  name: "slurm",
  executor: "slurm",
  queue: "short",
  containerEngine: "singularity",
  cpus: 2,
  memory: "4 GB",
  time: "2h",
  clusterOptions: "--account=lab --qos=normal",
  queueSize: 20,
};

describe("run profiles", () => {
  it("writes a SLURM profile with Singularity and resource defaults", () => {
    expect(buildProfileLines(slurm)).toEqual([
      "process.executor = 'slurm'",
      "process.queue = 'short'",
      "process.clusterOptions = '--account=lab --qos=normal'",
      "process.cpus = 2",
      "process.memory = '4 GB'",
      "process.time = '2h'",
      "executor.queueSize = 20",
      "docker.enabled = false",
      "singularity.enabled = true",
      "singularity.autoMounts = true",
    ]);
  });

  it("writes an AWS Batch profile with its region and S3 work directory", () => {
    const aws: RunProfile = {
      name: "aws",
      executor: "awsbatch",
      queue: "nwave-queue",
      containerEngine: "docker",
      awsRegion: "eu-west-1",
      workDir: "s3://my-bucket/work",
    };
    expect(findProfileProblems(aws)).toEqual([]);
    expect(buildProfileLines(aws)).toEqual([
      "process.executor = 'awsbatch'",
      "process.queue = 'nwave-queue'",
      "aws.region = 'eu-west-1'",
      "workDir = 's3://my-bucket/work'",
      "docker.enabled = true",
      "docker.runOptions = '-u $(id -u):$(id -g)'",
    ]);
  });

  it("writes Apptainer, or no containers", () => {
    expect(buildProfileLines({ name: "a", executor: "local", containerEngine: "apptainer" })).toEqual([
      "process.executor = 'local'",
      "docker.enabled = false",
      "apptainer.enabled = true",
      "apptainer.autoMounts = true",
    ]);
    expect(buildProfileLines({ name: "n", executor: "slurm", containerEngine: "none" })).toEqual([
      "process.executor = 'slurm'",
      "docker.enabled = false",
    ]);
  });

  it("puts the built-in docker profile first and leaves out profiles with problems", () => {
    const broken: RunProfile = { name: "bad name", executor: "slurm", containerEngine: "none" };
    const block = buildProfilesBlock([slurm, broken]);
    expect(block.split("\n")[0]).toBe("profiles {");
    expect(block).toContain("  docker {\n    docker.enabled = true");
    expect(block).toContain("  slurm {\n    process.executor = 'slurm'");
    expect(block).not.toContain("bad name");
    expect(block.trimEnd().endsWith("}")).toBe(true);
    expect(buildProfilesBlock([slurm], { builtIn: false })).not.toContain("docker {");
  });

  it("finds what is wrong with a profile", () => {
    expect(findProfileProblems(slurm)).toEqual([]);
    for (const preset of Object.values(RUN_PROFILE_PRESETS).filter((p) => p.executor !== "awsbatch")) {
      expect(findProfileProblems(preset)).toEqual([]);
    }
    const problems = (profile: Partial<RunProfile>, others: RunProfile[] = []) =>
      findProfileProblems({ ...slurm, ...profile }, others).join(" ");
    expect(problems({ name: "1st" })).toContain("start with a letter");
    expect(problems({ name: "docker" })).toContain("built-in");
    expect(problems({}, [slurm, { ...slurm }])).toContain('Another profile is called "slurm"');
    expect(problems({ queue: "a b" })).toContain("queue");
    expect(problems({ cpus: 0 })).toContain("CPUs");
    expect(problems({ memory: "lots" })).toContain("Memory");
    expect(problems({ time: "2 hours" })).toContain("Time");
    expect(problems({ queueSize: 0 })).toContain("Jobs at once");
    // Quotes would end the config string the options are written into.
    expect(problems({ clusterOptions: "--account='x'" })).toContain("quotes");
    expect(problems({ clusterOptions: "a\nb" })).toContain("line breaks");
    expect(
      findProfileProblems({ ...RUN_PROFILE_PRESETS.awsbatch, containerEngine: "singularity" }).join(" "),
    ).toMatch(/job queue.*region.*S3 work directory.*Docker/);
  });

  it("describes where a profile runs steps", () => {
    expect(describeProfile(slurm)).toBe("SLURM cluster, queue short, Singularity");
    expect(describeProfile({ name: "x", executor: "local", containerEngine: "none" })).toBe(
      "This computer, no containers",
    );
  });
});
