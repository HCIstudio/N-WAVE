// Common reasons a run fails, recognised in its log and explained in plain
// language with a fix and a link to the troubleshooting docs. The patterns
// are matched against what Nextflow prints (and the backend's own notes),
// first match wins, so more specific ones come first.

export type FailureKind =
  | "resource-limits"
  | "out-of-memory"
  | "docker-unavailable"
  | "container-pull"
  | "command-not-found"
  | "no-space"
  | "unreachable-url"
  | "missing-input"
  | "missing-output";

export interface FailureExplanation {
  kind: FailureKind;
  title: string;
  explanation: string;
  fix: string;
  /** The troubleshooting section for it. */
  docs: string;
  /** The Nextflow process that failed, e.g. "NFCORE_FASTQC_QC". */
  process?: string;
  /** The log line it was recognised by. */
  evidence?: string;
}

const DOCS = "https://github.com/HCIstudio/N-WAVE#";

interface Pattern {
  kind: FailureKind;
  title: string;
  docs: string;
  /** The line (or match) that shows this failure, or null. */
  find: (log: string) => string | null;
  explain: (evidence: string, log: string) => { explanation: string; fix: string };
}

const firstMatch = (log: string, pattern: RegExp): string | null => log.match(pattern)?.[0]?.trim() ?? null;

const PATTERNS: Pattern[] = [
  {
    kind: "resource-limits",
    title: "The run hit its resource limits",
    docs: "resource-limits-and-long-runs",
    // The backend's diagnosis, with the limits the run had.
    find: (log) => log.match(/^N-WAVE resource problem: (.+)$/m)?.[1]?.trim() ?? null,
    explain: (evidence) => ({
      explanation: evidence,
      fix: "Raise Maximum CPU Cores, Maximum Memory or the timeout in the execution settings, then run again.",
    }),
  },
  {
    kind: "out-of-memory",
    title: "A step ran out of memory",
    docs: "out-of-memory",
    find: (log) =>
      firstMatch(log, /terminated with an error exit status \(137\)/) ??
      firstMatch(log, /java\.lang\.OutOfMemoryError[^\n]*|std::bad_alloc|\bOOMKilled\b/),
    explain: () => ({
      explanation:
        "The step used more memory than it was given, so it was stopped (exit status 137).",
      fix: "Give the run more memory in the execution settings (Maximum Memory), or the step more memory in its panel, and run again.",
    }),
  },
  {
    kind: "docker-unavailable",
    title: "Docker isn't reachable",
    docs: "docker-isnt-reachable",
    find: (log) =>
      firstMatch(log, /[^\n]*(?:Cannot connect to the Docker daemon|failed to connect to the docker API)[^\n]*/i),
    explain: () => ({
      explanation:
        "The step runs in a Docker container, but Docker isn't running or N-WAVE can't reach it.",
      fix: "Start Docker (Docker Desktop on Windows and macOS), wait until it says it's running, then run again.",
    }),
  },
  {
    kind: "container-pull",
    title: "The step's container image couldn't be downloaded",
    docs: "container-image-cant-be-pulled",
    find: (log) =>
      /Unable to find image '[^']+' locally/.test(log) || /pull access denied|manifest unknown|Failed to pull/i.test(log)
        ? firstMatch(log, /[^\n]*(?:docker: Error response from daemon|pull access denied|manifest unknown|Failed to pull)[^\n]*/i) ??
          firstMatch(log, /Unable to find image '[^']+' locally/)
        : null,
    explain: () => ({
      explanation:
        "Docker had to download the step's container image first and couldn't: the image name is wrong, it doesn't exist, or the registry can't be reached.",
      fix: "Check the container image in the step's settings and the internet connection (or proxy) of the computer running N-WAVE, then run again.",
    }),
  },
  {
    kind: "command-not-found",
    title: "A program the step needs isn't installed",
    docs: "command-not-found",
    find: (log) =>
      firstMatch(log, /[^\n]*: command not found/) ?? firstMatch(log, /terminated with an error exit status \(127\)/),
    explain: (evidence, log) => {
      const program = evidence.match(/([\w.+-]+): command not found/)?.[1];
      // Nextflow lists the task's container when it ran in one.
      const container = log.match(/\nContainer:\s*\n\s*(\S+)/)?.[1];
      return {
        explanation: `${program ? `The step runs “${program}”, which` : "The step runs a program that"} isn't installed ${
          container ? `in its container (${container})` : "on this computer"
        } (exit status 127).`,
        fix: container
          ? "Use a container image that has the program (for a custom process, set it in the process), or check the command for typos."
          : "Run the step in a container that has the program: turn on Docker in the execution settings, or check the command for typos.",
      };
    },
  },
  {
    kind: "no-space",
    title: "The disk is full",
    docs: "no-space-left-on-device",
    find: (log) => firstMatch(log, /[^\n]*No space left on device[^\n]*/i),
    explain: () => ({
      explanation: "A step couldn't write its files because there's no space left on the disk.",
      fix: "Free disk space (old run folders, unused Docker images with `docker system prune`); on Docker Desktop, raise its disk image size.",
    }),
  },
  {
    kind: "unreachable-url",
    title: "A file on the internet couldn't be downloaded",
    docs: "url-cant-be-reached",
    find: (log) =>
      firstMatch(log, /Can't stage file (?:https?|ftp|s3):\/\/[^\n]*/) ??
      firstMatch(log, /[^\n]*(?:UnknownHostException|Could not resolve host|Connection refused|Server returned HTTP response code: \d+)[^\n]*/),
    explain: (evidence) => {
      const url = evidence.match(/(?:https?|ftp|s3):\/\/\S+/)?.[0];
      return {
        explanation: `${url ? `N-WAVE couldn't download ${url}` : "N-WAVE couldn't download an input from the internet"}: the address is wrong or the server can't be reached from this computer.`,
        fix: "Check the address (open it in a browser), the internet connection or proxy, or upload the file instead.",
      };
    },
  },
  {
    kind: "missing-input",
    title: "An input file wasn't found",
    docs: "input-file-not-found",
    find: (log) =>
      firstMatch(log, /ERROR ~ No such file or directory:[^\n]*/) ??
      firstMatch(log, /[^\n]*(?:No files match pattern|Not a valid path value|Path value cannot be null)[^\n]*/),
    explain: (evidence) => {
      const path = evidence.match(/No such file or directory: (\S+)/)?.[1];
      const name = path?.split("/").pop();
      return {
        explanation: `${name ? `“${name}” isn't` : "A file the workflow reads isn't"} where the workflow looks for it.`,
        fix: "Upload the file to a File Input node, or check the file names in your samplesheet and parameters (they must match the uploaded files).",
      };
    },
  },
  {
    kind: "missing-output",
    title: "A step didn't produce the files it should",
    docs: "missing-output-files",
    find: (log) => firstMatch(log, /Missing output file\(s\)[^\n]*/),
    explain: (evidence) => {
      const file = evidence.match(/`([^`]+)` expected/)?.[1];
      return {
        explanation: `The step finished, but ${file ? `“${file}”` : "a file it declares as output"} wasn't there.`,
        fix: "Check the step's command writes exactly the file names of its outputs (for a custom process, compare its output block and script).",
      };
    },
  },
];

/** The process Nextflow reports as failed: `Error executing process > 'NAME (tag)'`. */
export const failedProcessOf = (log: string): string | undefined =>
  log.match(/Error executing process > '([^'\s]+)/)?.[1];

/** Why the run failed, if it's one of the common reasons, or null. */
export const explainFailure = (log: string): FailureExplanation | null => {
  for (const pattern of PATTERNS) {
    const evidence = pattern.find(log);
    if (!evidence) continue;
    return {
      kind: pattern.kind,
      title: pattern.title,
      ...pattern.explain(evidence, log),
      docs: `${DOCS}${pattern.docs}`,
      process: failedProcessOf(log),
      evidence,
    };
  }
  return null;
};
