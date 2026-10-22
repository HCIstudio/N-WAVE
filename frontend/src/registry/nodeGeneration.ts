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
}

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
 * One file per emission: `[meta, files...]` items (Samplesheet rows, nf-core
 * outputs such as paired-end FastQC reports) contribute all their files, for
 * steps that take plain files.
 */
const filesOf = (channelExpr: string): string =>
  `${channelExpr}.flatMap { item ->
        def value = item instanceof List && item.size() > 1 ? (item[0] instanceof Map ? item[1..-1] : item[-1]) : item
        (value instanceof List ? value.flatten() : [value]).collect { entry ->
            file(entry instanceof String ? "\${params.inputdir}/\${entry}" : entry, glob: false)
        }
    }`;

export const generateFilterNode: NodeGenerator = ({
  node,
  processName,
  upstreamChannelName,
  outputChannelName,
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
        `    ${outputChannelName} = ${processName}(${filesOf(upstreamChannelName)})\n`,
      ],
    };
  }

  const selectedFileNames = selectedFiles.map((file) => file.name);
  const fileNameFilter = selectedFileNames
    .map((name: string) => `file.name == ${singleQuoted(name)}`)
    .join(" || ");

  return {
    processScript,
    channelDefinitions: [
      `    // Filter to only process selected files: ${selectedFileNames.join(
        ", "
      )}\n`,
      `    ${outputChannelName}_selected = ${filesOf(upstreamChannelName)}.filter { file -> ${fileNameFilter} }\n`,
    ],
    processInvocations: [
      `    ${outputChannelName} = ${processName}(${outputChannelName}_selected)\n`,
    ],
  };
};

export const generateMapNode: NodeGenerator = ({
  node,
  processName,
  upstreamChannelName,
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
    processInvocations: [
      `    ${outputChannelName} = ${processName}(${filesOf(upstreamChannelName)})\n`,
    ],
  };
};

export const generateMergeNode: NodeGenerator = ({
  node,
  processName,
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

  const mergeInputChannelName = `${outputChannelName}_merge_inputs`;

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
      `    ${mergeInputChannelName} = ${buildMixedChannelExpression(
        upstreamChannelNames
      )}\n`,
      `    ${outputChannelName} = ${processName}(${filesOf(mergeInputChannelName)}.collect())\n`,
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
      ? `${filesOf(upstreamChannelName)}.collect()`
      : filesOf(upstreamChannelName);

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
    processInvocations: [
      `    // Save output from: ${node.data.label || "Output"}\n`,
      `    ${processName}(${outputInvocationArg})\n`,
    ],
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
