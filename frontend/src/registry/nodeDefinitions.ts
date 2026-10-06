import type React from "react";
import type { Connection, Edge, Node } from "reactflow";
import type { NextflowProcessCategory } from "../data/types";
import type { FileObject, NodeData, PortData } from "../components/nodes/BaseNode";
import NotePanel from "../components/panels/input/NotePanel";
import ParametersPanel from "../components/panels/input/ParametersPanel";
import PipelinePanel from "../components/panels/process/PipelinePanel";
import ChannelOperatorPanel from "../components/panels/operator/ChannelOperatorPanel";
import { generateChannelOperatorNode } from "./channelOperator";
import SamplesheetPanel from "../components/panels/input/SamplesheetPanel";
import {
  DEFAULT_SAMPLESHEET_FILE_NAME,
  DEFAULT_SAMPLESHEET_MAPPING,
  RNASEQ_SAMPLESHEET_TEMPLATE,
} from "./samplesheet";
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

export type NodeKind =
  | "input"
  | "operator"
  | "process"
  | "output"
  /** Canvas notes: no ports, no code. */
  | "annotation";

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
  /** Kept for loading older workflows but not offered in the node palette. */
  hiddenFromPalette?: boolean;
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
    id: "samplesheet",
    kind: "input",
    category: "Input",
    label: "Samplesheet",
    description:
      "Reads an nf-core-style samplesheet (sample, fastq_1, fastq_2, ...) into [ meta, [ reads ] ] for nf-core modules.",
    type: "samplesheet",
    icon: "Sheet",
    outputs: [{ name: "samples", label: "Samples", isConnectable: true }],
    defaults: {
      subtitle: "No samples yet",
      samplesheet: RNASEQ_SAMPLESHEET_TEMPLATE,
      samplesheetFileName: DEFAULT_SAMPLESHEET_FILE_NAME,
      samplesheetMapping: DEFAULT_SAMPLESHEET_MAPPING,
      outputs: [{ name: "samples", label: "Samples", isConnectable: true }],
    },
    panel: SamplesheetPanel,
    executionLabel: "Samplesheet",
  },
  {
    id: "parameters",
    kind: "input",
    category: "Input",
    label: "Parameters",
    description:
      "Declares params.* and reference files (genome FASTA, GTF, indexes) that other nodes connect to.",
    type: "parameters",
    icon: "Settings2",
    outputs: [],
    defaults: {
      subtitle: "No parameters yet",
      parameters: [],
      outputs: [],
    },
    panel: ParametersPanel,
    executionLabel: "Parameters",
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
    id: "channelOperator",
    kind: "operator",
    category: "Operators",
    label: "Channel Operator",
    description:
      "Nextflow channel code between nodes: join, mix, map, branch, combine, groupTuple, collect or your own.",
    type: "channelOperator",
    icon: "GitMerge",
    inputs: [{ name: "left" }, { name: "right" }],
    outputs: [{ name: "joined", isConnectable: true }],
    defaults: {
      subtitle: "Join by sample",
      channelOperatorTemplate: "join",
      channelOperatorCode: "output.joined = input.left.join(input.right)",
      inputs: [
        { name: "left", label: "left", isConnectable: true },
        { name: "right", label: "right", isConnectable: true },
      ],
      outputs: [{ name: "joined", label: "joined", isConnectable: true }],
    },
    panel: ChannelOperatorPanel,
    generateNextflow: generateChannelOperatorNode,
    executionLabel: "Channel Operator",
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
    // Superseded by "Custom process" (a custom node with real code).
    hiddenFromPalette: true,
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
    id: "pipeline",
    kind: "process",
    category: "nf-core Pipelines",
    label: "nf-core Pipeline",
    description:
      "Runs a complete nf-core pipeline (e.g. rnaseq) with its parameters. The workflow then runs that pipeline instead of a generated script.",
    type: "pipeline",
    icon: "Workflow",
    inputs: [{ name: "input", label: "--input", isConnectable: true }],
    outputs: [],
    defaults: {
      label: "nf-core Pipeline",
      subtitle: "nf-core/rnaseq 3.27.0",
      pipelineName: "rnaseq",
      pipelineVersion: "3.27.0",
      pipelineTestProfile: false,
      pipelineValues: {},
      inputs: [{ name: "input", label: "--input", isConnectable: true }],
      outputs: [],
    },
    panel: PipelinePanel,
    executionLabel: "nf-core Pipeline",
    validateConnection: ({ sourceNode, targetNode }) => {
      if (
        targetNode?.type === "pipeline" &&
        !["fileInput", "samplesheet", "parameters"].includes(sourceNode?.type ?? "")
      ) {
        return {
          valid: false,
          message:
            "A pipeline takes its inputs from File Input, Samplesheet or Parameters nodes.",
        };
      }
      return { valid: true };
    },
  },
  {
    id: "note",
    kind: "annotation",
    category: "Notes",
    label: "Note",
    description:
      "Text on the canvas that explains the workflow. No connections, no code.",
    type: "note",
    icon: "StickyNote",
    defaults: {
      label: "Note",
      noteText: "",
      inputs: [],
      outputs: [],
    },
    panel: NotePanel,
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
  for (const definition of definitions) {
    dynamicNodeDefinitions.set(definition.id, definition);
  }
  nodeDefinitions.splice(0, nodeDefinitions.length, ...getAllNodeDefinitions());
};

export const unregisterDynamicNodeDefinitions = (ids: string[]): void => {
  for (const id of ids) {
    dynamicNodeDefinitions.delete(id);
  }
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

  for (const definition of nodeDefinitions) {
    if (definition.hiddenFromPalette) continue;
    let category = categories.get(definition.category);
    if (!category) {
      category = {
        category: definition.category,
        processes: [],
      };
      categories.set(definition.category, category);
    }

    category.processes.push({
      label: definition.label,
      description: definition.description,
      type: definition.type,
      icon: definition.icon,
      initialData: definition.defaults,
      operatorType: definition.operatorType,
      processType: definition.processType,
    });
  }

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
