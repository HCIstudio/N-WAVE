// Builds a self-contained Nextflow project from a generated workflow script:
// the files the backend would otherwise add at run time (module config,
// nf-core module and subworkflow files, input files) plus a README with the
// run command.

import { getSubworkflowIncludes } from "../registry/nfcore/subworkflowSource";
import {
  type PipelineLaunch,
  pipelineParamsFile,
} from "../registry/pipelines/launch";
import { base64ToBytes, type FileEncoding } from "../utils/fileContent";
import {
  buildProfilesBlock,
  describeProfile,
  type RunProfile,
  usableProfiles,
} from "../execution/runProfiles";

/** Pinned Nextflow version the generated scripts are tested with. */
export const DEFAULT_NEXTFLOW_VERSION = "25.04.4";

export interface ProjectInputFile {
  name: string;
  /** File content; undefined when the workflow only knows the file name. */
  content?: string;
  /** "base64" for binary files; text otherwise. */
  encoding?: FileEncoding;
}

/** A project file: text, or bytes (binary input files). */
export type ProjectFileContent = string | Uint8Array;

/** An input file's content as it goes into the project. */
const inputFileContent = (file: ProjectInputFile): ProjectFileContent =>
  file.encoding === "base64" ? base64ToBytes(file.content ?? "") : (file.content ?? "");

export interface ProjectExportInput {
  workflowName: string;
  /** The generated (or imported) Nextflow script. */
  script: string;
  inputFiles: ProjectInputFile[];
  /** nf-core module files keyed by module path ("fastqc", "star/align"). */
  moduleFiles: Record<string, Record<string, string>>;
  /** nf-core subworkflow files keyed by name ("bam_stats_samtools"). */
  subworkflowFiles?: Record<string, Record<string, string>>;
  nextflowVersion?: string;
  /** The workflow's run profiles, besides the built-in `docker` one. */
  profiles?: RunProfile[];
}

/**
 * Split the config the generator embeds in `N-WAVE_NEXTFLOW_CONFIG`
 * comments out of the script. Mirrors extractNwaveNextflowAssets in
 * backend/src/execution/nextflowScript.ts.
 */
export const extractNextflowConfig = (
  script: string,
): { script: string; config: string } => {
  const configBlocks: string[] = [];
  const cleaned = script.replace(
    /\/\*\s*N-WAVE_NEXTFLOW_CONFIG\s*([\s\S]*?)\*\//g,
    (_match, block: string) => {
      // The generator writes `*/` in values as `*\/`.
      configBlocks.push(block.replace(/\*\\\//g, "*/").trim());
      return "";
    },
  );
  return {
    script: cleaned.replace(/\n{3,}/g, "\n\n"),
    config: configBlocks.filter(Boolean).join("\n\n"),
  };
};

/**
 * nf-core modules a script includes, by module path ("star/align").
 * Mirrors getReferencedNfCoreModules in the backend.
 */
export const getReferencedNfCoreModules = (script: string): string[] => {
  const modules = new Set<string>();
  for (const match of script.matchAll(
    /from\s+['"]\.\/modules\/nf-core\/([A-Za-z0-9_/-]+)\/main['"]/g,
  )) {
    const modulePath = match[1];
    if (
      modulePath &&
      !modulePath.split("/").some((segment) => !segment || segment === "..")
    ) {
      modules.add(modulePath);
    }
  }
  return Array.from(modules).sort();
};

/**
 * nf-core subworkflows a script includes, by name ("bam_stats_samtools").
 * Mirrors getReferencedNfCoreSubworkflows in the backend.
 */
export const getReferencedNfCoreSubworkflows = (script: string): string[] => {
  const subworkflows = new Set<string>();
  for (const match of script.matchAll(
    /from\s+['"]\.\/subworkflows\/nf-core\/([A-Za-z0-9_-]+)\/main['"]/g,
  )) {
    subworkflows.add(match[1]);
  }
  return Array.from(subworkflows).sort();
};

/**
 * Every nf-core module and subworkflow a project needs: the ones the script
 * includes plus, recursively, the ones those subworkflows include.
 * `subworkflowSource` returns a subworkflow's main.nf (or undefined when it
 * isn't known yet).
 */
export const resolveNfCoreComponents = (
  script: string,
  subworkflowSource: (name: string) => string | undefined,
): { modules: string[]; subworkflows: string[]; unresolved: string[] } => {
  const modules = new Set(getReferencedNfCoreModules(script));
  const subworkflows = new Set<string>();
  const unresolved: string[] = [];
  const queue = getReferencedNfCoreSubworkflows(script);
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (subworkflows.has(name)) continue;
    subworkflows.add(name);
    const source = subworkflowSource(name);
    if (source === undefined) {
      unresolved.push(name);
      continue;
    }
    const includes = getSubworkflowIncludes(source);
    for (const module of includes.modules) modules.add(module);
    queue.push(...includes.subworkflows);
  }
  return {
    modules: Array.from(modules).sort(),
    subworkflows: Array.from(subworkflows).sort(),
    unresolved,
  };
};

/** A folder/file-name friendly version of the workflow name. */
export const toProjectName = (workflowName: string): string =>
  workflowName
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+|_+$/g, "") || "workflow";

const isPlainFileName = (name: string): boolean =>
  /^[^/\\]+$/.test(name) && name !== "." && name !== "..";

/** The README's line for an input file: included, missing, or a name a project can't hold. */
const inputFileLine = (file: ProjectInputFile): string =>
  file.content === undefined
    ? `- \`inputs/${file.name}\`: **not included**, add this file before running`
    : isPlainFileName(file.name)
      ? `- \`inputs/${file.name}\` (included)`
      : `- \`${file.name}\`: **not included**, its name isn't a plain file name; add it to \`inputs/\` under a name without \`/\` or \`\\\``;

/** A relative path without "..": "main.nf", "templates/tximport.r". */
const isSafeRelativePath = (filePath: string): boolean =>
  filePath.split("/").every(isPlainFileName);

export const buildNextflowConfig = (
  generatedConfig: string,
  profiles: RunProfile[] = [],
): string =>
  [
    "// Generated by N-WAVE.",
    usableProfiles(profiles).length > 0
      ? "// Run with: nextflow run main.nf -profile docker (or one of the profiles below)"
      : "// Run with: nextflow run main.nf -profile docker",
    "",
    "params {",
    "  outdir   = 'results'",
    '  inputdir = "${projectDir}/inputs"',
    "}",
    ...(generatedConfig.trim()
      ? ["", "// Module settings from the N-WAVE nodes", generatedConfig.trim()]
      : []),
    "",
    buildProfilesBlock(profiles),
    "",
  ].join("\n");

/** The README's section on running through the workflow's own profiles. */
const profilesSection = (
  profiles: RunProfile[],
  command: (name: string) => string,
): string[] => {
  const usable = usableProfiles(profiles);
  if (usable.length === 0) return [];
  return [
    "## Run profiles",
    "",
    "The project has these profiles of its own:",
    "",
    ...usable.map((profile) => `- \`${profile.name}\`: ${describeProfile(profile)}`),
    "",
    "Use one of them in place of `docker`, for example:",
    "",
    "```bash",
    command(usable[0]?.name ?? ""),
    "```",
    "",
    ...(usable.some((profile) => profile.executor === "slurm")
      ? [
          "On a cluster, start Nextflow where jobs can be submitted (a login node, or",
          "a job of its own) and keep the project on a file system the compute nodes",
          "share: each step runs as its own job in `work/`.",
          "",
        ]
      : []),
    ...(usable.some((profile) => profile.containerEngine === "singularity" || profile.containerEngine === "apptainer")
      ? [
          "Singularity and Apptainer pull each step's image on first use; set",
          "`NXF_SINGULARITY_CACHEDIR` (or `NXF_APPTAINER_CACHEDIR`) to a shared folder to",
          "pull them once.",
          "",
        ]
      : []),
    ...(usable.some((profile) => profile.executor === "awsbatch")
      ? [
          "AWS Batch needs AWS credentials where Nextflow runs, and the job queue's",
          "compute environment needs the AWS CLI (see",
          "[Nextflow's AWS Batch guide](https://www.nextflow.io/docs/latest/aws.html)).",
          "",
        ]
      : []),
  ];
};

export const buildReadme = ({
  projectName,
  workflowName,
  modules,
  subworkflows = [],
  inputFiles,
  nextflowVersion,
  profiles = [],
}: {
  projectName: string;
  workflowName: string;
  modules: string[];
  subworkflows?: string[];
  inputFiles: ProjectInputFile[];
  nextflowVersion: string;
  profiles?: RunProfile[];
}): string => {
  const hasProfiles = usableProfiles(profiles).length > 0;

  return [
    `# ${workflowName}`,
    "",
    "A Nextflow workflow exported from [N-WAVE](https://github.com/HCIstudio/N-WAVE).",
    "",
    "## Requirements",
    "",
    `- [Nextflow](https://www.nextflow.io/docs/latest/install.html) (tested with ${nextflowVersion})`,
    hasProfiles
      ? "- [Docker](https://docs.docker.com/get-docker/), running (for the `docker` profile), or what your profile below uses"
      : "- [Docker](https://docs.docker.com/get-docker/), running",
    "",
    "## Run",
    "",
    "```bash",
    `cd ${projectName}`,
    "nextflow run main.nf -profile docker",
    "```",
    "",
    "Outputs of Display Output nodes are written to `results/`; intermediate files",
    "stay in Nextflow's `work/` directory. Use `--outdir <dir>` to write results",
    "elsewhere and `-resume` to continue a run.",
    "",
    ...profilesSection(profiles, (name) => `nextflow run main.nf -profile ${name}`),
    "## Inputs",
    "",
    ...(inputFiles.length === 0
      ? ["This workflow reads no input files."]
      : [
          "Input files are read from `inputs/` (change with `--inputdir <dir>`).",
          "",
          ...inputFiles.map(inputFileLine),
        ]),
    "",
    "## Contents",
    "",
    "- `main.nf`: the workflow",
    hasProfiles
      ? "- `nextflow.config`: parameters, module settings and the run profiles"
      : "- `nextflow.config`: parameters, module settings and the `docker` profile",
    ...(modules.length > 0
      ? [
          "- `modules/nf-core/`: the nf-core modules the workflow uses:",
          ...modules.map((module) => `  - \`${module}\``),
        ]
      : []),
    ...(subworkflows.length > 0
      ? [
          "- `subworkflows/nf-core/`: the nf-core subworkflows the workflow uses:",
          ...subworkflows.map((subworkflow) => `  - \`${subworkflow}\``),
        ]
      : []),
    ...(inputFiles.length > 0 ? ["- `inputs/`: input files"] : []),
    "",
  ].join("\n");
};

/**
 * All files of the exported project, keyed by path inside the project
 * folder. Throws when a module the script includes has no files.
 */
export const buildProjectFiles = (
  input: ProjectExportInput,
): Record<string, ProjectFileContent> => {
  const projectName = toProjectName(input.workflowName);
  const { script, config } = extractNextflowConfig(input.script);
  const subworkflowFiles = input.subworkflowFiles ?? {};
  const { modules, subworkflows, unresolved } = resolveNfCoreComponents(
    script,
    (name) => subworkflowFiles[name]?.["main.nf"],
  );
  if (unresolved.length > 0) {
    throw new Error(`Missing files for nf-core subworkflow ${unresolved[0]}.`);
  }
  const nextflowVersion = input.nextflowVersion || DEFAULT_NEXTFLOW_VERSION;

  const files: Record<string, ProjectFileContent> = {
    "main.nf": script,
    "nextflow.config": buildNextflowConfig(config, input.profiles),
    "README.md": buildReadme({
      projectName,
      workflowName: input.workflowName || projectName,
      modules,
      subworkflows,
      inputFiles: input.inputFiles,
      nextflowVersion,
      profiles: input.profiles,
    }),
  };

  for (const subworkflow of subworkflows) {
    for (const [name, content] of Object.entries(
      subworkflowFiles[subworkflow] ?? {},
    )) {
      if (isSafeRelativePath(name)) {
        files[`subworkflows/nf-core/${subworkflow}/${name}`] = content;
      }
    }
  }

  for (const module of modules) {
    const moduleFiles = input.moduleFiles[module];
    if (!moduleFiles?.["main.nf"]) {
      throw new Error(`Missing files for nf-core module ${module}.`);
    }
    for (const [name, content] of Object.entries(moduleFiles)) {
      if (isSafeRelativePath(name)) {
        files[`modules/nf-core/${module}/${name}`] = content;
      }
    }
  }

  for (const file of input.inputFiles) {
    if (file.content !== undefined && isPlainFileName(file.name)) {
      files[`inputs/${file.name}`] = inputFileContent(file);
    }
  }

  return files;
};

/**
 * The project for a workflow with a Pipeline node: the launch command (in
 * README.md and run.sh), the params file and the input files. The pipeline
 * itself is pulled from GitHub by Nextflow.
 */
export const buildPipelineProjectFiles = ({
  workflowName,
  launch,
  nextflowVersion = DEFAULT_NEXTFLOW_VERSION,
  profiles = [],
}: {
  workflowName: string;
  launch: PipelineLaunch;
  nextflowVersion?: string;
  /** The workflow's run profiles, written to profiles.config. */
  profiles?: RunProfile[];
}): Record<string, ProjectFileContent> => {
  const projectName = toProjectName(workflowName);
  const hasProfiles = usableProfiles(profiles).length > 0;
  // The launch with the profile in place of Docker, reading profiles.config.
  const commandWith = (name: string): string =>
    `${launch.command.replace(
      `-profile ${launch.profiles.join(",")}`,
      `-profile ${launch.profiles.map((profile) => (profile === "docker" ? name : profile)).join(",")}`,
    )} -c profiles.config`;
  const included = launch.inputFiles.filter((file) => file.content !== undefined);
  const files: Record<string, ProjectFileContent> = {
    "run.sh": `#!/usr/bin/env bash\n# Generated by N-WAVE.\nset -euo pipefail\ncd "$(dirname "$0")"\n${launch.command} "$@"\n`,
    "README.md": [
      `# ${workflowName || projectName}`,
      "",
      `Runs [nf-core/${launch.name}](https://nf-co.re/${launch.name}/${launch.version}) ${launch.version}, exported from [N-WAVE](https://github.com/HCIstudio/N-WAVE).`,
      "",
      "## Requirements",
      "",
      `- [Nextflow](https://www.nextflow.io/docs/latest/install.html) (tested with ${nextflowVersion})`,
      "- [Docker](https://docs.docker.com/get-docker/), running",
      "",
      "## Run",
      "",
      "```bash",
      `cd ${projectName}`,
      launch.command,
      "```",
      "",
      "or `./run.sh`. Nextflow downloads the pipeline and its containers on the first run.",
      "Results are written to `results/` (the MultiQC report is under `results/multiqc/`).",
      "Add `-resume` to continue a run.",
      "",
      ...profilesSection(profiles, commandWith).map((line) =>
        line === "The project has these profiles of its own:"
          ? "`profiles.config` has these profiles of the workflow's own:"
          : line,
      ),
      ...(Object.keys(launch.params).length > 0
        ? ["Parameters are in `params.json`.", ""]
        : []),
      ...(launch.inputFiles.length > 0
        ? [
            "## Inputs",
            "",
            ...launch.inputFiles.map(inputFileLine),
            "",
          ]
        : []),
    ].join("\n"),
  };
  if (Object.keys(launch.params).length > 0) {
    files["params.json"] = pipelineParamsFile(launch);
  }
  if (hasProfiles) {
    files["profiles.config"] = `// Generated by N-WAVE: the workflow's run profiles.\n${buildProfilesBlock(profiles, { builtIn: false })}\n`;
  }
  for (const file of included) {
    if (isPlainFileName(file.name)) {
      files[`inputs/${file.name}`] = inputFileContent(file);
    }
  }
  return files;
};

/**
 * Zip the project into a single folder named after the workflow. fflate is
 * loaded on demand so it stays out of the main bundle.
 */
export const zipProject = async (
  workflowName: string,
  files: Record<string, ProjectFileContent>,
): Promise<Blob> => {
  const { strToU8, zipSync } = await import("fflate");
  const projectName = toProjectName(workflowName);
  const entries = Object.fromEntries(
    Object.entries(files).map(([filePath, content]) => [
      `${projectName}/${filePath}`,
      typeof content === "string" ? strToU8(content) : content,
    ]),
  );
  const zipped = zipSync(entries, { level: 6 });
  return new Blob([zipped], { type: "application/zip" });
};
