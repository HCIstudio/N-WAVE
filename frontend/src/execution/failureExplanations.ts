// Common reasons a run fails, recognised in its log and explained in plain
// language with a fix and a link to the troubleshooting docs. The patterns
// are matched against what Nextflow prints (and the backend's own notes),
// first match wins, so more specific ones come first. Each explanation says
// what it is based on (the log lines it matched), how certain it is, and
// for a likely one what else can cause the same (see the wiki's "How N-WAVE
// explains things").

import { wikiUrl } from "../docs/links";
import { stripTerminalCodes } from "../utils/terminalCodes";
export type FailureKind =
  | "resource-limits"
  | "out-of-memory"
  | "task-time-limit"
  | "docker-unavailable"
  | "container-pull"
  | "command-not-found"
  | "no-space"
  | "pipeline-download"
  | "plugin-download"
  | "unreachable-url"
  | "missing-input"
  | "missing-output";

/**
 * "certain": the evidence means one thing (an exit status like 137, a
 * message only this failure prints). "likely": a pattern other failures
 * can print too; the explanation lists them.
 */
export type Certainty = "certain" | "likely";

/** A line of the log an explanation is based on. */
export interface Evidence {
  text: string;
  /** Its line in the log, from 0. */
  line: number;
}

export interface FailureExplanation {
  kind: FailureKind;
  title: string;
  explanation: string;
  fix: string;
  certainty: Certainty;
  /** What else can cause the same (likely explanations). */
  alternatives: string[];
  /** The troubleshooting section for it. */
  docs: string;
  /** The Nextflow process that failed, e.g. "NFCORE_FASTQC_QC". */
  process?: string;
  /** The log lines it was recognised by: the match, and the task's exit status. */
  evidence: Evidence[];
}

/** The wiki's troubleshooting page, where each kind of failure has a section. */
const DOCS = `${wikiUrl({ page: "Troubleshooting" })}#`;

interface Pattern {
  kind: FailureKind;
  title: string;
  docs: string;
  /** The line (or match) that shows this failure, or null. */
  find: (log: string) => string | null;
  /** How certain the match makes it (some patterns are certain only in one of their forms). */
  certainty: Certainty | ((evidence: string) => Certainty);
  /** For a likely match: what else prints the same. */
  alternatives?: string[];
  explain: (evidence: string, log: string) => { explanation: string; fix: string };
}

const firstMatch = (log: string, pattern: RegExp): string | null => log.match(pattern)?.[0]?.trim() ?? null;

const PATTERNS: Pattern[] = [
  {
    kind: "resource-limits",
    title: "The run hit its resource limits",
    docs: "the-run-hit-its-resource-limits",
    // N-WAVE's own diagnosis from the limits it gave the run.
    certainty: "certain",
    // The backend's diagnosis, with the limits the run had.
    find: (log) => log.match(/^N-WAVE resource problem: (.+)$/m)?.[1]?.trim() ?? null,
    explain: (evidence) => ({
      explanation: evidence,
      fix: "Raise Maximum CPU Cores, Maximum Memory or the timeout in the execution settings, then run again.",
    }),
  },
  {
    kind: "task-time-limit",
    title: "A step ran longer than its time limit",
    docs: "a-step-ran-longer-than-its-time-limit",
    certainty: (evidence) => (/time limit/.test(evidence) ? "certain" : "likely"),
    alternatives: [
      "Docker was slow to stop or clean up the step's container, so Nextflow couldn't read how it ended.",
      "The computer was under so much load that the step's container stopped answering.",
    ],
    // Nextflow 26.04 can report the stopped task as "process hasn't exited"
    // (it asks for the exit code before the task is gone).
    find: (log) =>
      firstMatch(log, /Process exceeded running time limit \([^)]*\)/) ??
      firstMatch(log, /^\s*process hasn't exited\s*$/m),
    explain: (evidence) => {
      const limit = evidence.match(/time limit \(([^)]+)\)/)?.[1];
      return {
        explanation: `A step was still running when it reached its time limit${
          limit ? ` (${limit})` : ""
        }, so Nextflow stopped it. nf-core test profiles give every step 1 hour; with less memory or CPUs than a pipeline expects, or files on a slow drive, steps take longer.`,
        fix: "Give the run more memory and CPUs in the execution settings, or keep the run's files on a fast local disk, then run again with Resume. N-WAVE lets a step run as long as the run's own time limit.",
      };
    },
  },
  {
    kind: "out-of-memory",
    title: "A step ran out of memory",
    docs: "out-of-memory",
    // Exit status 137 is a kill: almost always for memory, but not only.
    certainty: (evidence) => (/137/.test(evidence) ? "likely" : "certain"),
    alternatives: [
      "Something else stopped the step: it was cancelled, or a cluster or Docker ended it for running too long.",
    ],
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
    certainty: "certain",
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
    certainty: (evidence) => (/pull access denied|manifest unknown|Failed to pull/i.test(evidence) ? "certain" : "likely"),
    alternatives: [
      "Docker couldn't start the container for another reason (a mount, a port or a platform it doesn't support); the full message is in the log.",
    ],
    // "Unable to find image … locally" only starts a download, which usually
    // works ("Status: Downloaded newer image"): only Docker's errors count.
    find: (log) =>
      firstMatch(log, /[^\n]*(?:pull access denied|manifest unknown|Failed to pull)[^\n]*/i) ??
      firstMatch(log, /[^\n]*docker: Error response from daemon[^\n]*/i),
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
    certainty: (evidence) => (/command not found/.test(evidence) ? "certain" : "likely"),
    alternatives: [
      "The step's script calls another script or tool by a path that doesn't exist.",
      "The script starts with an interpreter (#!) that isn't in the container.",
    ],
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
    certainty: "certain",
    find: (log) => firstMatch(log, /[^\n]*No space left on device[^\n]*/i),
    explain: () => ({
      explanation: "A step couldn't write its files because there's no space left on the disk.",
      fix: "Free disk space (old run folders, unused Docker images with `docker system prune`); on Docker Desktop, raise its disk image size.",
    }),
  },
  {
    kind: "pipeline-download",
    title: "The pipeline couldn't be downloaded",
    docs: "the-pipeline-cant-be-downloaded",
    certainty: (evidence) => (/Forbidden|rate limit/.test(evidence) ? "certain" : "likely"),
    alternatives: ["The pipeline's name or version is misspelled, or that version doesn't exist."],
    find: (log) =>
      firstMatch(log, /[^\n]*Forbidden -- Provide your GitHub user name[^\n]*/) ??
      firstMatch(log, /[^\n]*(?:API rate limit exceeded|Cannot find `nf-core\/)[^\n]*/),
    explain: () => ({
      explanation:
        "Nextflow downloads a pipeline from GitHub on its first run, and GitHub refused: its limit for downloads without an account (60 an hour) is used up, or the network blocks github.com.",
      fix: "Wait an hour and run again, or give the N-WAVE server a GitHub access token (GITHUB_TOKEN). Behind a firewall, allow github.com and api.github.com.",
    }),
  },
  {
    kind: "plugin-download",
    title: "Nextflow couldn't download its plugins",
    docs: "nextflow-cant-download-its-plugins",
    // Nextflow's message for an unreachable registry is cryptic.
    certainty: "likely",
    alternatives: [
      "The pipeline asks for a plugin version that doesn't exist, or one this Nextflow version can't use.",
      "A proxy answers in place of the registry and returns something else.",
    ],
    // Nextflow 25.10 reports a plugin registry it can't reach this way.
    find: (log) =>
      firstMatch(log, /ERROR ~ Conversion = '[^\n]*/) ??
      firstMatch(log, /[^\n]*(?:Cannot find plugin|Unable to (?:download|access) plugin|Plugin with id \S+ not found)[^\n]*/i),
    explain: () => ({
      explanation:
        "The pipeline needs Nextflow plugins (such as nf-schema), which Nextflow downloads from registry.nextflow.io on their first use, and it couldn't reach that address.",
      fix: "Allow registry.nextflow.io in the firewall or proxy of the computer running Nextflow, then run again.",
    }),
  },
  {
    kind: "unreachable-url",
    title: "A file on the internet couldn't be downloaded",
    docs: "url-cant-be-reached",
    certainty: "likely",
    alternatives: [
      "The file needs a login, or the link has expired.",
      "The server was down for a moment: running again may work.",
    ],
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
    certainty: "likely",
    alternatives: [
      "A path in the samplesheet or parameters is relative to another folder than the one the run starts in.",
      "An earlier step was meant to make the file but didn't run.",
    ],
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
    certainty: "likely",
    alternatives: [
      "The step's command failed without an error exit status, so it wrote nothing.",
      "The tool writes its file under a different name or into a subfolder (check its version).",
    ],
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

/** The log lines a match is in: the first line holding its start. */
const evidenceLines = (log: string, match: string): Evidence[] => {
  const lines = log.split("\n");
  const first = match.split("\n")[0].trim();
  const line = lines.findIndex((text) => text.includes(first));
  if (line === -1) return [{ text: match, line: -1 }];
  const found: Evidence[] = [{ text: lines[line].trim(), line }];
  // Nextflow prints the task's exit status two lines below "Command exit status:".
  const status = lines.findIndex((text) => /^Command exit status:\s*$/.test(text.trim()));
  if (status !== -1 && lines[status + 1]?.trim() && status + 1 !== line) {
    found.push({ text: `Command exit status: ${lines[status + 1].trim()}`, line: status + 1 });
  }
  return found;
};

/** Every explanation N-WAVE can give for a failed run (for the docs and tests). */
export const FAILURE_RULES = PATTERNS.map((pattern) => ({
  kind: pattern.kind,
  title: pattern.title,
  docs: `${DOCS}${pattern.docs}`,
  certainties: typeof pattern.certainty === "string" ? [pattern.certainty] : (["certain", "likely"] as Certainty[]),
  alternatives: pattern.alternatives ?? [],
}));

/** Why the run failed, if it's one of the common reasons, or null. */
export const explainFailure = (raw: string): FailureExplanation | null => {
  // As the log is shown: colour codes don't change its lines.
  const log = stripTerminalCodes(raw);
  for (const pattern of PATTERNS) {
    const evidence = pattern.find(log);
    if (!evidence) continue;
    const certainty = typeof pattern.certainty === "string" ? pattern.certainty : pattern.certainty(evidence);
    return {
      kind: pattern.kind,
      title: pattern.title,
      ...pattern.explain(evidence, log),
      certainty,
      alternatives: certainty === "likely" ? (pattern.alternatives ?? []) : [],
      docs: `${DOCS}${pattern.docs}`,
      process: failedProcessOf(log),
      evidence: evidenceLines(log, evidence),
    };
  }
  return null;
};
