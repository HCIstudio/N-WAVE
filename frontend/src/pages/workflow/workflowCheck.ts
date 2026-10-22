// The check of a workflow before it runs: problems in plain language, each on
// the node it is about where there is one. Errors block the run (it would
// fail, or do nothing); warnings let it run.

import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../../components/nodes/BaseNode";
import { getNodeParameters, validateParameters } from "../../registry/params";
import { getPipelineLaunchIssues } from "../../registry/pipelines/launch";
import { findExtraConnections, inputLabel } from "../../registry/portArity";
import { connectionHints } from "../../registry/portTypes";
import { getSamplesheetMapping, parseSamplesheet } from "../../registry/samplesheet";
import type { ExecutionSettings } from "../../types/execution";
import { getNodeInputFiles, getWorkflowInputFiles } from "../../utils/inputFiles";
import { describeCycle, findCycle } from "../../registry/workflowCycles";

export type ProblemLevel = "error" | "warning";

export interface WorkflowProblem {
  /** Stable while the problem lasts (a list key). */
  id: string;
  level: ProblemLevel;
  message: string;
  /** The node the problem is about, if any. */
  nodeId?: string;
  /** About the server (Docker, Nextflow), which can be checked again. */
  system?: boolean;
}

/** GET /execute/docker-status */
export interface DockerStatus {
  dockerAvailable: boolean;
  error?: string;
  details?: string;
}

/** GET /execute/nextflow-status */
export interface NextflowStatus {
  nextflowAvailable: boolean;
  dockerNextflowAvailable: boolean;
  error?: string;
}

/** GET /execute/limits */
export interface ServerLimits {
  maxCpus: number;
  maxMemory: string;
  maxMemoryBytes: number;
}

export interface CheckContext {
  /** Install ids of nf-core components the canvas uses but lacks. */
  missingNfCoreComponents: string[];
  settings: ExecutionSettings;
  /** Null while unknown (or in the demo, which doesn't run workflows). */
  docker: DockerStatus | null;
  nextflow: NextflowStatus | null;
  limits: ServerLimits | null;
}

/** Nodes that only document the workflow. */
const PASSIVE_TYPES = new Set(["note"]);

const labelOf = (node: Node<NodeData>): string =>
  String(node.data.label || node.type || "This node");

const MEMORY_UNITS: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
};

/** Bytes of a Nextflow memory value such as "4.GB" or "512 MB", or null. */
export const memoryBytes = (value: string): number | null => {
  const match = /^\s*(\d+(?:\.\d+)?)\s*\.?\s*([KMGT]?B)\s*$/i.exec(value);
  if (!match) return null;
  return Number(match[1]) * MEMORY_UNITS[match[2].toUpperCase()];
};

/**
 * Which inputs a node can't do without: all of a channel operator's, else
 * the first (the generator skips a node without it; nf-core modules pass
 * their other inputs empty).
 */
const requiredInputs = (node: Node<NodeData>): string[] => {
  const inputs = (Array.isArray(node.data.inputs) ? node.data.inputs : [])
    .map((port) => port?.name)
    .filter((name): name is string => typeof name === "string" && name !== "");
  if (node.type === "channelOperator") return inputs;
  return inputs.slice(0, 1);
};

const checkNodes = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  context: CheckContext,
): WorkflowProblem[] => {
  const problems: WorkflowProblem[] = [];
  const add = (node: Node<NodeData>, key: string, level: ProblemLevel, message: string) =>
    problems.push({ id: `${node.id}:${key}`, level, message, nodeId: node.id });
  const uploadedFiles = nodes
    .filter((node) => node.type === "fileInput")
    .flatMap((node) => getNodeInputFiles(node))
    .map((file) => file.name);
  const missing = new Set(context.missingNfCoreComponents);

  for (const node of nodes) {
    if (PASSIVE_TYPES.has(node.type ?? "")) continue;
    const incoming = edges.filter((edge) => edge.target === node.id);
    const outgoing = edges.filter((edge) => edge.source === node.id);
    const connected = incoming.length > 0 || outgoing.length > 0;
    const label = labelOf(node);

    const moduleId = node.data.nwaveNfCoreModuleId;
    if (typeof moduleId === "string" && missing.has(moduleId)) {
      add(node, "nfcore", "error", `${moduleId} isn't installed, so this node can't run. Install it from the notice at the top.`);
      continue;
    }

    // Parameters are used by name in scripts, without connections; a
    // pipeline runs on its own (it checks its inputs below).
    if (!connected && node.type !== "parameters" && node.type !== "pipeline") {
      add(node, "unconnected", "warning", `“${label}” isn't connected to anything, so it won't take part in the run.`);
      continue;
    }

    if (node.type === "fileInput") {
      const files = Array.isArray(node.data.files) ? node.data.files : [];
      if (files.length === 0) {
        add(node, "nofile", "error", `Add a file to “${label}”: it has nothing to pass on.`);
      }
      const lost = files
        .filter((file) => !file.content || file.content.trim() === "")
        .map((file) => file.name || file.originalName || "a file");
      if (lost.length > 0) {
        add(node, "lostfile", "error", `Upload ${lost.map((name) => `“${name}”`).join(", ")} again: files over 256 KB aren't kept after a reload.`);
      }
      continue;
    }

    if (node.type === "samplesheet") {
      const text = typeof node.data.samplesheet === "string" ? node.data.samplesheet : "";
      const { issues } = parseSamplesheet(text, getSamplesheetMapping(node.data), uploadedFiles);
      for (const [index, issue] of issues.entries()) {
        add(node, `samplesheet${index}`, issue.level, issue.line ? `Line ${issue.line}: ${issue.message}` : issue.message);
      }
      continue;
    }

    if (node.type === "parameters") {
      const parameters = getNodeParameters(node.data);
      const otherNames = nodes
        .filter((other) => other.type === "parameters" && other.id !== node.id)
        .flatMap((other) => getNodeParameters(other.data))
        .map((parameter) => parameter.name);
      for (const [index, issue] of validateParameters(parameters, otherNames, uploadedFiles).entries()) {
        add(node, `param${index}`, issue.level, issue.message);
      }
      for (const parameter of parameters) {
        if ((parameter.type === "text" || parameter.type === "number") && String(parameter.value ?? "").trim() === "") {
          add(node, `empty:${parameter.name}`, "warning", `params.${parameter.name} has no value.`);
        }
      }
      continue;
    }

    if (node.type === "pipeline") continue;

    const unconnected = requiredInputs(node).filter(
      (port) => !incoming.some((edge) => edge.targetHandle === port),
    );
    if (unconnected.length > 0) {
      add(node, "input", "error", `Connect something to the ${unconnected.map((port) => `“${port}”`).join(" and ")} input of “${label}”: it can't run without ${unconnected.length > 1 ? "them" : "it"}.`);
    }
  }
  return problems;
};

const checkWorkflowWide = (
  nodes: Node<NodeData>[],
  edges: Edge[],
): WorkflowProblem[] => {
  const problems: WorkflowProblem[] = [];
  if (nodes.every((node) => PASSIVE_TYPES.has(node.type ?? ""))) {
    problems.push({ id: "empty", level: "error", message: "The workflow is empty: add nodes with the + button." });
  }
  const pipeline = nodes.find((node) => node.type === "pipeline");
  for (const [index, message] of getPipelineLaunchIssues(nodes, edges).entries()) {
    problems.push({ id: `pipeline${index}`, level: "error", message, nodeId: pipeline?.id });
  }
  // A loop can't be generated (channels flow one way).
  const cycle = findCycle(edges);
  if (cycle) {
    problems.push({
      id: "cycle",
      level: "error",
      message: `The workflow has a loop: ${describeCycle(cycle, nodes)}. A step's output can't come back to its own input; remove one of these connections.`,
      nodeId: cycle[0],
    });
  }

  // Several connections into a one-connection input (saved before the rule):
  // the run would use them all, which the step doesn't expect.
  for (const { node, handle, count } of findExtraConnections(nodes, edges)) {
    const label = String(node.data.label || node.type);
    problems.push({
      id: `extra:${node.id}:${handle}`,
      level: "error",
      message: `“${label}” takes one connection on “${inputLabel(node, handle)}” but has ${count}. Connect them to a Merge node (or mix them in a channel operator) and connect that instead.`,
      nodeId: node.id,
    });
  }
  // Ports that don't fit: a warning on the step the connection feeds.
  for (const [edgeId, hint] of Object.entries(connectionHints(nodes, edges))) {
    problems.push({
      id: `fit:${edgeId}`,
      level: "warning",
      message: `${hint.message} ${hint.fix}`,
      nodeId: edges.find((edge) => edge.id === edgeId)?.target,
    });
  }
  // Imported .nf processes: runs use the imported script, not the canvas.
  const imported = nodes.filter((node) => node.data.importedProcess === true);
  if (imported.length > 0) {
    problems.push({
      id: "imported",
      level: "warning",
      message: `${imported.map(labelOf).map((label) => `“${label}”`).join(", ")} ${imported.length === 1 ? "comes" : "come"} from the imported .nf file. Runs and exports use that file as it is, so changes on the canvas don't apply until these steps are removed.`,
      nodeId: imported[0].id,
    });
  }
  try {
    getWorkflowInputFiles(nodes);
  } catch (error) {
    problems.push({ id: "inputfiles", level: "error", message: error instanceof Error ? error.message : String(error) });
  }
  return problems;
};

const checkServer = (nodes: Node<NodeData>[], context: CheckContext): WorkflowProblem[] => {
  const problems: WorkflowProblem[] = [];
  const { docker, nextflow, limits, settings } = context;
  if (nextflow && !nextflow.nextflowAvailable && !nextflow.dockerNextflowAvailable) {
    problems.push({
      id: "nextflow",
      level: "error",
      system: true,
      message: "Nextflow isn't available on the server: install Nextflow, or start Docker so N-WAVE can use Nextflow's container.",
    });
  }
  const needsDocker =
    settings.container?.enabled ||
    nodes.some((node) => node.type === "pipeline" || typeof node.data.nwaveNfCoreModuleId === "string");
  if (docker && !docker.dockerAvailable && needsDocker) {
    problems.push({
      id: "docker",
      level: "error",
      system: true,
      message: `This workflow runs its steps in Docker, which isn't available (${docker.error ?? "unknown reason"}). Start Docker, then check again.`,
    });
  }
  if (limits) {
    const cpus = settings.resources?.maxCpus;
    if (typeof cpus === "number" && cpus > limits.maxCpus) {
      problems.push({
        id: "cpus",
        level: "warning",
        message: `The run asks for ${cpus} CPU cores, but this server allows ${limits.maxCpus}: it will get ${limits.maxCpus}.`,
      });
    }
    const memory = memoryBytes(settings.resources?.maxMemory ?? "");
    if (memory !== null && memory > limits.maxMemoryBytes) {
      problems.push({
        id: "memory",
        level: "warning",
        message: `The run asks for ${settings.resources.maxMemory} of memory, but this server allows ${limits.maxMemory}: it will get ${limits.maxMemory}.`,
      });
    }
  }
  return problems;
};

/** Everything that stops the workflow from running well, errors first. */
export const checkWorkflow = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  context: CheckContext,
): WorkflowProblem[] => {
  const problems = [
    ...checkWorkflowWide(nodes, edges),
    ...checkNodes(nodes, edges, context),
    ...checkServer(nodes, context),
  ];
  return [
    ...problems.filter((problem) => problem.level === "error"),
    ...problems.filter((problem) => problem.level === "warning"),
  ];
};
