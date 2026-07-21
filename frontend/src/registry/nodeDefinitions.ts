import type React from "react";
import type { Connection, Edge, Node } from "reactflow";
import type { NextflowProcessCategory } from "../data/types";
import type { FileObject, NodeData, PortData } from "../components/nodes/BaseNode";
import FileInputPanel from "../components/panels/input/FileInputPanel";
import FilterPanel from "../components/panels/operator/FilterPanel";
import MapPanel from "../components/panels/operator/MapPanel";
import MergePanel from "../components/panels/operator/MergePanel";
import ProcessNodePanel from "../components/panels/process/ProcessNodePanel";
import FastQCPanel from "../components/panels/process/FastQCPanel";
import TrimmomaticPanel from "../components/panels/process/TrimmomaticPanel";
import { useFilterOperator } from "../hooks/operator/useFilterOperator";
import { useMapOperator } from "../hooks/operator/useMapOperator";
import { useMergeOperator } from "../hooks/operator/useMergeOperator";
import {
  generateFilterNode,
  generateGenericProcessNode,
  generateMapNode,
  generateMergeNode,
  generateOutputDisplayNode,
  type NodeGenerator,
} from "./nodeGeneration";
import {
  fastqcNfCoreAdapter,
  generateNfCoreModuleNode,
  trimmomaticNfCoreAdapter,
} from "./nfcoreModuleAdapters";

export type NodeKind = "input" | "operator" | "process" | "output";

export type NodePanelComponent = React.ComponentType<{
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}>;

export type NodePreviewHook = (
  incomingFiles: FileObject[],
  nodeData: NodeData,
  onSave: (data: Partial<NodeData>) => void
) => unknown;

export interface NodeConnectionValidationContext {
  connection: Connection;
  sourceNode?: Node<NodeData>;
  targetNode?: Node<NodeData>;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

export interface NodeConnectionValidationResult {
  valid: boolean;
  message?: string;
}

export type NodeConnectionValidator = (
  context: NodeConnectionValidationContext
) => NodeConnectionValidationResult | null | undefined;

export interface NodeDefinition {
  id: string;
  kind: NodeKind;
  label: string;
  description: string;
  type: string;
  icon: string;
  category: string;
  inputs?: PortData[];
  outputs?: PortData[];
  defaults?: Partial<NodeData>;
  operatorType?: string;
  processType?: string;
  panel?: NodePanelComponent;
  previewHook?: NodePreviewHook;
  executionLabel?: string;
  generateNextflow?: NodeGenerator;
  validateConnection?: NodeConnectionValidator;
}

const withPorts = (
  defaults: Partial<NodeData>,
  inputs?: PortData[],
  outputs?: PortData[]
): Partial<NodeData> => ({
  ...defaults,
  ...(inputs ? { inputs } : {}),
  ...(outputs ? { outputs } : {}),
});

const builtinNodeDefinitions: NodeDefinition[] = [
  {
    id: "fileInput",
    kind: "input",
    category: "Input",
    label: "File Input",
    description: "Provides a file as a channel.",
    type: "fileInput",
    icon: "FolderOpen",
    outputs: [{ name: "out", isConnectable: true }],
    defaults: {
      outputs: [{ name: "out", isConnectable: true }],
    },
    panel: FileInputPanel,
    executionLabel: "File Input",
    validateConnection: ({ sourceNode }) => {
      if (
        sourceNode?.type === "fileInput" &&
        (!sourceNode.data.files || sourceNode.data.files.length === 0)
      ) {
        return {
          valid: false,
          message: "File Input requires at least one file before connecting.",
        };
      }

      return { valid: true };
    },
  },
  {
    id: "filter",
    kind: "operator",
    category: "Operators",
    label: "Filter",
    description: "Filter items based on a condition.",
    type: "operator",
    icon: "Funnel",
    operatorType: "filter",
    inputs: [{ name: "in" }],
    outputs: [{ name: "out", isConnectable: true }],
    defaults: withPorts({ operatorType: "filter" }, [{ name: "in" }], [
      { name: "out", isConnectable: true },
    ]),
    panel: FilterPanel,
    previewHook: useFilterOperator,
    generateNextflow: generateFilterNode,
    executionLabel: "Filter",
  },
  {
    id: "map",
    kind: "operator",
    category: "Operators",
    label: "Map",
    description: "Transform each item in a channel.",
    type: "operator",
    icon: "Wand",
    operatorType: "map",
    inputs: [{ name: "in" }],
    outputs: [{ name: "out", isConnectable: true }],
    defaults: withPorts(
      {
        operatorType: "map",
        mapOperation: "changeCase",
        mapChangeCase: "toUpperCase",
        mapReplaceFind: "",
        mapReplaceWith: "",
      },
      [{ name: "in" }],
      [{ name: "out", isConnectable: true }]
    ),
    panel: MapPanel,
    previewHook: useMapOperator,
    generateNextflow: generateMapNode,
    executionLabel: "Map",
  },
  {
    id: "merge",
    kind: "operator",
    category: "Operators",
    label: "Merge",
    description: "Merge multiple files of the same type.",
    type: "operator",
    icon: "Minimize",
    operatorType: "merge",
    inputs: [{ name: "in" }],
    outputs: [{ name: "out", isConnectable: true }],
    defaults: withPorts(
      {
        operatorType: "merge",
        mergeOperation: "join",
        mergeJoinSeparator: "\\n",
      },
      [{ name: "in" }],
      [{ name: "out", isConnectable: true }]
    ),
    panel: MergePanel,
    previewHook: useMergeOperator,
    generateNextflow: generateMergeNode,
    executionLabel: "Merge",
  },
  {
    id: "process",
    kind: "process",
    category: "Core",
    label: "Process",
    description: "A custom Nextflow process.",
    type: "process",
    icon: "Cog",
    inputs: [{ name: "in" }],
    outputs: [{ name: "out", isConnectable: true }],
    defaults: withPorts({}, [{ name: "in" }], [
      { name: "out", isConnectable: true },
    ]),
    panel: ProcessNodePanel,
    generateNextflow: generateGenericProcessNode,
    executionLabel: "Process",
  },
  {
    id: "fastqc",
    kind: "process",
    category: "Core",
    label: "FastQC",
    description:
      "Runs FastQC on raw sequencing data for quality control assessment.",
    type: "process",
    icon: "ClipboardCheck",
    processType: "fastqc",
    inputs: [{ name: "reads", label: "FASTQ Files", isConnectable: true }],
    outputs: [
      { name: "html", label: "HTML Reports", isConnectable: true },
      { name: "zip", label: "ZIP Archives", isConnectable: true },
      { name: "versions", label: "Versions", isConnectable: true },
    ],
    defaults: {
      processType: "fastqc",
      label: "FastQC",
      subtitle: "Quality Control",
      inputs: [{ name: "reads", label: "FASTQ Files", isConnectable: true }],
      outputs: [
        { name: "html", label: "HTML Reports", isConnectable: true },
        { name: "zip", label: "ZIP Archives", isConnectable: true },
        { name: "versions", label: "Versions", isConnectable: true },
      ],
      threads: 1,
      format: "",
      kmers: 7,
      nogroup: false,
      adapters: "",
      limits: "",
      containerImage: "biocontainers/fastqc:latest",
      cpus: 2,
      memory: "4.GB",
      timeLimit: "2.h",
    },
    panel: FastQCPanel,
    generateNextflow: generateNfCoreModuleNode(fastqcNfCoreAdapter),
    executionLabel: "FastQC",
  },
  {
    id: "trimmomatic",
    kind: "process",
    category: "Core",
    label: "Trimmomatic",
    description:
      "Quality trimming and filtering of FASTQ reads using Trimmomatic.",
    type: "process",
    icon: "Scissors",
    processType: "trimmomatic",
    inputs: [{ name: "reads", label: "FASTQ", isConnectable: true }],
    outputs: [
      { name: "trimmed_reads", label: "Trimmed", isConnectable: true },
      { name: "unpaired_reads", label: "Unpaired", isConnectable: true },
      { name: "trim_log", label: "Log", isConnectable: true },
      { name: "out_log", label: "Output Log", isConnectable: true },
      { name: "summary", label: "Summary", isConnectable: true },
      { name: "versions", label: "Versions", isConnectable: true },
    ],
    defaults: {
      processType: "trimmomatic",
      label: "Trimmomatic",
      subtitle: "Quality Trimming",
      inputs: [{ name: "reads", label: "FASTQ", isConnectable: true }],
      outputs: [
        { name: "trimmed_reads", label: "Trimmed", isConnectable: true },
        { name: "unpaired_reads", label: "Unpaired", isConnectable: true },
        { name: "trim_log", label: "Log", isConnectable: true },
        { name: "out_log", label: "Output Log", isConnectable: true },
        { name: "summary", label: "Summary", isConnectable: true },
        { name: "versions", label: "Versions", isConnectable: true },
      ],
      leading: 3,
      trailing: 3,
      slidingwindow: "4:15",
      minlen: 36,
      adapter_file: "",
      custom_steps: "",
      phred_score: "33",
      containerImage: "staphb/trimmomatic:latest",
      cpus: 4,
      memory: "4.GB",
      timeLimit: "4.h",
    },
    panel: TrimmomaticPanel,
    generateNextflow: generateNfCoreModuleNode(trimmomaticNfCoreAdapter),
    executionLabel: "Trimmomatic",
    validateConnection: ({ sourceNode, targetNode }) => {
      if (
        targetNode?.data?.processType === "trimmomatic" &&
        sourceNode?.data?.processType === "fastqc"
      ) {
        return {
          valid: false,
          message:
            "Cannot connect FastQC to Trimmomatic. FastQC produces quality reports (ZIP/HTML), not FASTQ files. Connect both to the same File Input instead.",
        };
      }

      return { valid: true };
    },
  },
  {
    id: "outputDisplay",
    kind: "output",
    category: "Output",
    label: "Display Output",
    description: "Displays the final output of a workflow channel.",
    type: "outputDisplay",
    icon: "Eye",
    inputs: [{ name: "in" }],
    defaults: {
      inputs: [{ name: "in" }],
    },
    generateNextflow: generateOutputDisplayNode,
    executionLabel: "Display Output",
    validateConnection: ({ targetNode, edges }) => {
      if (targetNode?.type === "outputDisplay") {
        const existingEdges = edges.filter(
          (edge) => edge.target === targetNode.id
        );
        if (existingEdges.length > 0) {
          return {
            valid: false,
            message: "Display Output can only take one input.",
          };
        }
      }

      return { valid: true };
    },
  },
];

const dynamicNodeDefinitions = new Map<string, NodeDefinition>();

const getAllNodeDefinitions = (): NodeDefinition[] => [
  ...builtinNodeDefinitions,
  ...Array.from(dynamicNodeDefinitions.values()),
];

export const nodeDefinitions: NodeDefinition[] = getAllNodeDefinitions();

export const registerDynamicNodeDefinitions = (
  definitions: NodeDefinition[]
): void => {
  definitions.forEach((definition) => {
    dynamicNodeDefinitions.set(definition.id, definition);
  });
  nodeDefinitions.splice(0, nodeDefinitions.length, ...getAllNodeDefinitions());
};

export const unregisterDynamicNodeDefinitions = (ids: string[]): void => {
  ids.forEach((id) => {
    dynamicNodeDefinitions.delete(id);
  });
  nodeDefinitions.splice(0, nodeDefinitions.length, ...getAllNodeDefinitions());
};

export const clearDynamicNodeDefinitions = (): void => {
  dynamicNodeDefinitions.clear();
  nodeDefinitions.splice(0, nodeDefinitions.length, ...getAllNodeDefinitions());
};

export const getNodeDefinitionById = (
  id: string
): NodeDefinition | undefined => nodeDefinitions.find((definition) => definition.id === id);

export const getNodeDefinitionByOperatorType = (
  operatorType: string
): NodeDefinition | undefined =>
  nodeDefinitions.find((definition) => definition.operatorType === operatorType);

export const getNodeDefinitionByProcessType = (
  processType: string
): NodeDefinition | undefined =>
  nodeDefinitions.find((definition) => definition.processType === processType);

export const getNodeDefinitionForNode = (
  node: Node<NodeData>
): NodeDefinition | undefined => {
  if (node.type === "operator" && node.data.operatorType) {
    return getNodeDefinitionByOperatorType(node.data.operatorType);
  }

  if (node.type === "filter") {
    return getNodeDefinitionByOperatorType("filter");
  }

  if (node.type === "process" && node.data.processType) {
    return getNodeDefinitionByProcessType(node.data.processType);
  }

  return nodeDefinitions.find((definition) => definition.type === node.type);
};

export const getRegisteredOperatorTypes = (): string[] =>
  nodeDefinitions
    .filter((definition) => definition.kind === "operator" && definition.operatorType)
    .map((definition) => definition.operatorType as string);

export const getNodePaletteCategories = (): NextflowProcessCategory[] => {
  const categories = new Map<string, NextflowProcessCategory>();

  nodeDefinitions.forEach((definition) => {
    if (!categories.has(definition.category)) {
      categories.set(definition.category, {
        category: definition.category,
        processes: [],
      });
    }

    categories.get(definition.category)!.processes.push({
      label: definition.label,
      description: definition.description,
      type: definition.type,
      icon: definition.icon,
      initialData: definition.defaults,
      operatorType: definition.operatorType as any,
      processType: definition.processType as any,
    });
  });

  return Array.from(categories.values());
};

export const getExecutionLabelForProcessName = (
  nfProcessName: string
): string | undefined => {
  const normalizedProcessName = nfProcessName.toLowerCase();
  const definition = nodeDefinitions.find((candidate) => {
    const ids = [
      candidate.id,
      candidate.operatorType,
      candidate.processType,
      candidate.type === "outputDisplay" ? "save" : undefined,
    ].filter((value): value is string => Boolean(value));

    return ids.some((id) => normalizedProcessName.includes(id.toLowerCase()));
  });

  return definition?.executionLabel;
};

export const validateConnectionWithNodeDefinitions = (
  context: NodeConnectionValidationContext
): NodeConnectionValidationResult => {
  const validators = [
    context.sourceNode
      ? getNodeDefinitionForNode(context.sourceNode)?.validateConnection
      : undefined,
    context.targetNode
      ? getNodeDefinitionForNode(context.targetNode)?.validateConnection
      : undefined,
  ].filter(
    (validator): validator is NodeConnectionValidator => Boolean(validator)
  );

  for (const validator of validators) {
    const result = validator(context);
    if (result && !result.valid) {
      return result;
    }
  }

  return { valid: true };
};
