// What a run needs before it starts, what it sends, and how its output is
// read when it ends.

import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../../components/nodes/BaseNode";
import { generateNextflowScript } from "../../generators";
import type { PipelineLaunch } from "../../registry/pipelines/launch";
import type { ExecutionSettings } from "../../types/execution";
import { getWorkflowInputFiles, isFileContentMissing } from "../../utils/inputFiles";
import { findResourceProblem } from "../../utils/streamLines";
import { flattenExecutionSettings } from "./executionSettings";
import {
  canRunFromNwave,
  findProfileProblems,
  type RunProfile,
} from "../../execution/runProfiles";

/**
 * Whether runs and exports use the imported .nf source instead of generating
 * one: the canvas has no nodes, or it shows processes whose code only the
 * imported source has (they'd be generated as empty stubs).
 */
export const usesImportedSource = ({
  sourceFormat,
  rawSource,
  nodes,
}: {
  sourceFormat: "visual" | "nextflow";
  rawSource: string | null;
  nodes: Node<NodeData>[];
}): boolean =>
  sourceFormat === "nextflow" &&
  Boolean(rawSource) &&
  (nodes.length === 0 || nodes.some((node) => node.data.importedProcess === true));

/**
 * The profile a run goes through, or null for this computer. Throws when the
 * chosen one can't be used, so the run doesn't quietly happen elsewhere.
 */
export const findRunProfile = (settings: ExecutionSettings): RunProfile | null => {
  if (!settings.runProfile) return null;
  const profiles = settings.runProfiles ?? [];
  const profile = profiles.find((candidate) => candidate.name === settings.runProfile);
  if (!profile) {
    throw new Error(
      `The run profile "${settings.runProfile}" no longer exists. Choose another in Execution Settings → Profiles.`,
    );
  }
  const problems = findProfileProblems(profile, profiles);
  if (problems.length > 0) {
    throw new Error(`The run profile "${profile.name}" can't be used: ${problems.join(" ")}`);
  }
  if (!canRunFromNwave(profile)) {
    throw new Error(
      `The run profile "${profile.name}" is for exported projects only; N-WAVE can't run AWS Batch itself yet.`,
    );
  }
  return profile;
};

/** Uploaded files whose content is gone (after a reload). */
export const findMissingFileContents = (nodes: Node<NodeData>[]): string[] =>
  nodes
    .filter((node) => node.type === "fileInput" && Array.isArray(node.data.files))
    .flatMap((node) =>
      (node.data.files ?? [])
        .filter(isFileContentMissing)
        .map((file) => file.name || file.originalName || "unknown_file"),
    );

/** Why the workflow can't run yet, or null. */
export const findRunProblem = (
  nodes: Node<NodeData>[],
  edges: Edge[],
): string | null => {
  // A connected File Input without files would run on nothing.
  const emptyInputs = nodes.filter(
    (node) =>
      node.type === "fileInput" &&
      edges.some((edge) => edge.source === node.id) &&
      !(Array.isArray(node.data.files) && node.data.files.length > 0),
  );
  if (emptyInputs.length > 0) {
    return `Add a file to ${emptyInputs
      .map((node) => `"${node.data.label || "File Input"}"`)
      .join(", ")} before running the workflow.`;
  }

  const missing = findMissingFileContents(nodes);
  if (missing.length > 0) {
    const one = missing.length === 1;
    return `Cannot execute workflow: ${missing.length} file${
      one ? "" : "s"
    } missing content.\n\nMissing files:\n${missing
      .map((name) => `• ${name}`)
      .join("\n")}\n\nPlease upload ${
      one ? "this file" : "these files"
    } before running the workflow.`;
  }
  return null;
};

interface RunRequestOptions {
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflowId: string | undefined;
  workflowName: string;
  settings: ExecutionSettings;
  /** Set when a Pipeline node runs a whole nf-core pipeline. */
  launch: PipelineLaunch | null;
  /** An imported .nf workflow's own source, run as is while it has no nodes. */
  rawSource: string | null;
  sourceFormat: "visual" | "nextflow";
  /** Resume the workflow's last run (reuse its unchanged steps). */
  resume?: boolean;
}

/** The body of POST /execute/execute. Throws when there is nothing to run. */
export const buildRunRequest = ({
  nodes,
  edges,
  workflowId,
  workflowName,
  settings,
  launch,
  rawSource,
  sourceFormat,
  resume = false,
}: RunRequestOptions) => {
  // An empty field means the default; "" would name every run's folder the same.
  const namingPattern =
    settings.output?.namingPattern?.trim() || "{workflow_name}_{timestamp}";

  // Files for the input directory: File Input uploads and samplesheets.
  // Binary files (gzipped FASTQ, BAM) travel as base64 and are named in
  // fileEncoding, so the backend writes their bytes.
  const fileContent: Record<string, string> = {};
  const fileEncoding: Record<string, "base64"> = {};
  for (const file of launch?.inputFiles ?? getWorkflowInputFiles(nodes)) {
    // Empty files are sent too: the workflow reads them like any other.
    if (file.content === undefined) continue;
    fileContent[file.name] = file.content;
    if (file.encoding === "base64") fileEncoding[file.name] = "base64";
  }

  const nextflowScript = launch
    ? ""
    : rawSource && usesImportedSource({ sourceFormat, rawSource, nodes })
      ? rawSource
      : generateNextflowScript(
          nodes,
          edges,
          workflowName || "workflow",
          settings.output.directory || "results",
          namingPattern,
        );
  const runProfile = findRunProfile(settings);
  if (!launch && nextflowScript.trim() === "") {
    throw new Error(
      "Generated Nextflow script is empty. Please add nodes to your workflow.",
    );
  }

  return {
    ...(launch
      ? {
          pipeline: {
            name: launch.name,
            version: launch.version,
            profiles: launch.profiles,
            params: launch.params,
          },
        }
      : { nextflowScript }),
    workflowName: workflowName || "workflow",
    useDocker: settings.container?.enabled,
    containerImage: settings.container?.defaultImage,
    outputDirectory: settings.output.directory,
    executionSettings: {
      ...flattenExecutionSettings(settings),
      outputNaming: namingPattern,
    },
    fileContent,
    ...(Object.keys(fileEncoding).length > 0 ? { fileEncoding } : {}),
    // Keeps the run in this workflow's history.
    ...(workflowId ? { workflowId } : {}),
    ...(workflowId && resume ? { resume: true } : {}),
    ...(runProfile ? { runProfile } : {}),
  };
};

export type RunOutcome =
  | { kind: "cancelled" }
  | { kind: "succeeded" }
  | { kind: "failed"; resourceProblem: string | null; reason?: string };

/** What the backend prints when it stops a run because it shuts down. */
const SHUTDOWN_STOP = /^N-WAVE: the run was stopped because N-WAVE shut down\..*$/m;

/** How a finished run went, from its streamed output. */
export const readRunOutcome = (output: string): RunOutcome => {
  if (/^Execution cancelled$/m.test(output)) return { kind: "cancelled" };
  const shutdown = output.match(SHUTDOWN_STOP)?.[0];
  if (shutdown) {
    return { kind: "failed", resourceProblem: null, reason: shutdown.replace(/^N-WAVE: t/, "T") };
  }
  const resourceProblem = findResourceProblem(output);
  const lower = output.toLowerCase();
  const failed =
    lower.includes("nextflow execution failed with exit code") ||
    lower.includes("execution error:") ||
    lower.includes("failed to setup workflow execution") ||
    lower.includes("error ~") ||
    resourceProblem !== null;
  return failed ? { kind: "failed", resourceProblem } : { kind: "succeeded" };
};

/** The run id the backend prints first ("N-WAVE run: <id>"). */
export const runIdFromOutput = (output: string): string | undefined =>
  output.match(/^N-WAVE run: (\S+)$/m)?.[1];
