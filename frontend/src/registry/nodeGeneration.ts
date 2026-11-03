import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";
import {
  generateOperatorCode,
  generateOutputCode,
  generateProcessCode,
} from "../generators/core/templateEngine";
import { singleQuoted } from "./params";

export interface NodeGenerationContext {
  node: Node<NodeData>;
  processName: string;
  incomingEdges: Edge[];
  upstreamChannelName: string;
  /** Every upstream step gives plain files (no `[meta, files]` tuples). */
  upstreamIsFiles?: boolean;
  outputChannelName: string | null;
  channelNameMap: Map<string, string>;
  outputDisplayCounter: number;
  outputNamingPattern: string;
  workflowName: string;
  timestamp: number;
  date: string;
  resolveChannelNameForEdge: (
    edge: Edge,
    channelNameMap: Map<string, string>
  ) => string | null;
  buildMixedChannelExpression: (channelNames: string[]) => string;
  sanitizeVarName: (name: string) => string;
  /** A unique lower-case channel name, e.g. "ch_star_align_reads". */
  channelNameFor?: (base: string) => string;
  /** What the items coming over a connection look like, when known. */
  shapeOf?: (edge: Edge) => ItemShape;
}

/** Plain files, `[meta, files]` tuples, or not known. */
export type ItemShape = "file" | "meta" | "unknown";

export interface NodeGenerationResult {
  processScript: string;
  processInvocations: string[];
  channelDefinitions?: string[];
  includeStatements?: string[];
  nextflowConfigBlocks?: string[];
  includeInExecutionOrder?: boolean;
  outputDisplayCounterIncrement?: number;
  /**
   * The workflow variables the invocations define and use, for ordering.
   * Without it they are guessed from the code, which only suits generated
   * code (free-form code has closure variables that look like channels).
   */
  dependencies?: { defines: string[]; uses: string[] };
}

export type NodeGenerator = (
  context: NodeGenerationContext
) => NodeGenerationResult | null;

const getResourceSettings = (node: Node<NodeData>) => ({
  containerImage: node.data.containerImage || "ubuntu:22.04",
  cpus: node.data.cpus || 1,
  memory: node.data.memory || "2.GB",
});

/**
 * One file per item, for steps that take plain files. Files pass as they
 * are; `[meta, files]` items (Samplesheet rows, nf-core outputs such as
 * paired-end reads) give each of their files.
 */
const filesOf = (channelExpr: string, plainFiles = false): string =>
  plainFiles ? channelExpr : `${channelExpr}.flatten().filter { item -> item instanceof Path }`;

export const generateFilterNode: NodeGenerator = ({
  node,
  processName,
  upstreamChannelName,
  upstreamIsFiles,
  outputChannelName,
  channelNameFor,
}) => {
  if (!outputChannelName) return null;

  const filterText = node.data.filterText || "";
  const filterMode = node.data.filterMode || "contains";
  const filterNegate = node.data.filterNegate || false;
  const selectedFiles = node.data.selectedFilterFiles || [];
  const { containerImage, cpus, memory } = getResourceSettings(node);

  const processScript = generateOperatorCode("filter", {
    processName,
    cpuCount: cpus,
    memoryAmount: memory,
    containerImage,
    filterText,
    filterMode,
    filterNegate,
  });

  if (selectedFiles.length === 0) {
    return {
      processScript,
      processInvocations: [
        `    ${processName}(${filesOf(upstreamChannelName, upstreamIsFiles)})\n`,
      ],
    };
  }

  const selectedFileNames = selectedFiles.map((file) => file.name);
  const fileNameFilter = selectedFileNames
    .map((name: string) => `file.name == ${singleQuoted(name)}`)
    .join(" || ");

  const selected = channelNameFor?.(`ch_${processName}_selected`) ?? `${outputChannelName}_selected`;
  return {
    processScript,
    channelDefinitions: [
      `    ${selected} = ${filesOf(upstreamChannelName, upstreamIsFiles)}.filter { file -> ${fileNameFilter} }\n`,
    ],
    processInvocations: [`    ${processName}(${selected})\n`],
  };
};

export const generateMapNode: NodeGenerator = ({
  node,
  processName,
  upstreamChannelName,
  upstreamIsFiles,
  outputChannelName,
}) => {
  if (!outputChannelName) return null;

  const { containerImage, cpus, memory } = getResourceSettings(node);

  return {
    processScript: generateOperatorCode("map", {
      processName,
      cpuCount: cpus,
      memoryAmount: memory,
      containerImage,
      mapOperation: node.data.mapOperation || "changeCase",
      mapChangeCase: node.data.mapChangeCase,
      mapReplaceFind: node.data.mapReplaceFind,
      mapReplaceWith: node.data.mapReplaceWith,
    }),
    processInvocations: [`    ${processName}(${filesOf(upstreamChannelName, upstreamIsFiles)})\n`],
  };
};

export const generateMergeNode: NodeGenerator = ({
  node,
  processName,
  upstreamIsFiles,
  outputChannelName,
  incomingEdges,
  channelNameMap,
  resolveChannelNameForEdge,
  buildMixedChannelExpression,
}) => {
  if (!outputChannelName) return null;

  const mergeOperation = node.data.mergeOperation || "join";
  if (mergeOperation !== "join") return null;

  const { containerImage, cpus, memory } = getResourceSettings(node);
  const upstreamChannelNames = incomingEdges
    .map((edge) => resolveChannelNameForEdge(edge, channelNameMap))
    .filter((channelName): channelName is string => !!channelName);

  if (upstreamChannelNames.length === 0) return null;

  return {
    processScript: generateOperatorCode("merge", {
      processName,
      cpuCount: cpus,
      memoryAmount: memory,
      containerImage,
      mergeOperation: "join",
      joinType: node.data.joinType || "txt",
    }),
    processInvocations: [
      `    ${processName}(${filesOf(buildMixedChannelExpression(upstreamChannelNames), upstreamIsFiles)}.collect())\n`,
    ],
  };
};

export const generateGenericProcessNode: NodeGenerator = (context) => {
  const { node, processName } = context;
  const { containerImage, cpus, memory } = getResourceSettings(node);
  // A process shown from an imported .nf file: its code is only in that file
  // (runs use it as it is), so it can't be written here as a stub.
  if (node.data.importedProcess && !node.data.script) {
    throw new Error(
      `“${node.data.label || processName}” comes from the imported .nf file, which holds its code. Remove it to build the workflow from nodes, or run the imported workflow as it is.`,
    );
  }

  return {
    processScript: generateProcessCode("generic", {
      processName,
      cpuCount: cpus,
      memoryAmount: memory,
      containerImage,
      script: node.data.script || '"""\necho "Hello World"\n"""',
      timeLimit: node.data.timeLimit || "1.h",
    }),
    processInvocations: buildProcessInvocations(context),
  };
};

export const generateOutputDisplayNode: NodeGenerator = ({
  node,
  processName,
  upstreamChannelName,
  upstreamIsFiles,
  outputDisplayCounter,
  outputNamingPattern,
  workflowName,
  timestamp,
  date,
}) => {
  const outputLabel = (node.data.label || "Output")
    .replace(/[\s-]+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_");
  const downloadFormat = node.data.downloadFormat || "txt";
  const selectedFileName = node.data.selectedFileName || "all";
  const { containerImage, cpus, memory } = getResourceSettings(node);

  const outputInvocationArg =
    selectedFileName === "all"
      ? `${filesOf(upstreamChannelName, upstreamIsFiles)}.collect()`
      : filesOf(upstreamChannelName, upstreamIsFiles);

  return {
    processScript: generateOutputCode({
      processName,
      cpuCount: cpus,
      memoryAmount: memory,
      containerImage,
      outputLabel,
      downloadFormat,
      selectedFileName,
      outputDisplayCounter,
      outputNamingPattern,
      workflowName,
      timestamp,
      date,
    }),
    processInvocations: [`    ${processName}(${outputInvocationArg})\n`],
    outputDisplayCounterIncrement: 1,
  };
};

function buildProcessInvocations({
  node,
  processName,
  incomingEdges,
  channelNameMap,
  resolveChannelNameForEdge,
  sanitizeVarName,
}: NodeGenerationContext): string[] {
  const inputChannels =
    incomingEdges.length > 0
      ? incomingEdges
          .map((edge) => resolveChannelNameForEdge(edge, channelNameMap))
          .filter((channelName): channelName is string => Boolean(channelName))
          .join(", ")
      : "";

  const outputVars = Array.isArray(node.data.outputs)
    ? node.data.outputs
        .map((output: { name: string }) => {
          if (!output?.name) return undefined;
          return (
            channelNameMap.get(`${node.id}.${output.name}`) ??
            sanitizeVarName(`${processName}_${output.name}`)
          );
        })
        .filter(Boolean)
    : [];

  if (outputVars.length > 0) {
    return [`    (${outputVars.join(", ")}) = ${processName}(${inputChannels})\n`];
  }

  return [`    ${processName}(${inputChannels})\n`];
}
