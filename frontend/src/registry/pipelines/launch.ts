// Launching a whole nf-core pipeline from the canvas: a Pipeline node plus
// the input nodes connected to it become `nextflow run nf-core/<name>`
// with a params file, instead of a generated script.

import type { Edge, Node } from "reactflow";
import type { NodeData } from "../../components/nodes/BaseNode";
import {
  getNodeInputFiles,
  type WorkflowInputFile,
} from "../../utils/inputFiles";
import { getNodeParameters } from "../params";
import {
  DEFAULT_SAMPLESHEET_MAPPING,
  getSamplesheetFileName,
  getSamplesheetMapping,
  isRemoteOrAbsolutePath,
  parseCsv,
} from "../samplesheet";
import type { PipelineParamValue, PipelineParamValues } from "./schema";

/** Pipelines offered in the Pipeline node (any other can be typed in). */
export const KNOWN_PIPELINES: Array<{
  name: string;
  versions: string[];
  description: string;
}> = [
  {
    name: "rnaseq",
    versions: ["3.27.0"],
    description:
      "RNA sequencing analysis: QC, trimming, alignment or pseudoalignment, quantification.",
  },
];

export const PIPELINE_NAME = /^[a-z0-9][a-z0-9_-]*$/;
export const PIPELINE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Where launches read their input files from, relative to the launch dir. */
export const PIPELINE_INPUT_DIR = "inputs";

/** Node types that may sit next to a Pipeline node: they only provide files. */
const INPUT_NODE_TYPES = new Set(["fileInput", "samplesheet", "parameters"]);

export interface PipelineLaunch {
  nodeId: string;
  name: string;
  version: string;
  /** Always ends with "docker"; "test" first with the test profile. */
  profiles: string[];
  /** Params for the params file (outdir is passed on the command line). */
  params: Record<string, PipelineParamValue>;
  /** Files for the input directory (names relative to it). */
  inputFiles: WorkflowInputFile[];
  /** The command, run from the launch directory. */
  command: string;
}

export const isPipelineWorkflow = (nodes: Node[]): boolean =>
  nodes.some((node) => node.type === "pipeline");

const inInputDir = (path: string): string =>
  isRemoteOrAbsolutePath(path) ? path : `${PIPELINE_INPUT_DIR}/${path}`;

/**
 * Problems that stop a workflow with a Pipeline node from launching. Such a
 * workflow holds one Pipeline node and only input nodes feeding it.
 */
export const getPipelineLaunchIssues = (
  nodes: Node<NodeData>[],
  edges: Edge[],
): string[] => {
  const pipelines = nodes.filter((node) => node.type === "pipeline");
  if (pipelines.length === 0) return [];
  const issues: string[] = [];
  if (pipelines.length > 1) {
    issues.push(
      "A workflow can run one pipeline; remove the extra Pipeline nodes.",
    );
  }
  const others = nodes.filter(
    (node) =>
      node.type !== "pipeline" && !INPUT_NODE_TYPES.has(node.type ?? ""),
  );
  if (others.length > 0) {
    issues.push(
      "A workflow with a Pipeline node runs that pipeline only; it can hold input nodes (File Input, Samplesheet, Parameters) but no other steps.",
    );
  }
  const [pipeline] = pipelines;
  const name = String(pipeline.data.pipelineName ?? "");
  const version = String(pipeline.data.pipelineVersion ?? "");
  if (!PIPELINE_NAME.test(name)) issues.push("Choose a pipeline.");
  if (!PIPELINE_VERSION.test(version))
    issues.push("Choose a pipeline version.");
  if (
    !pipeline.data.pipelineTestProfile &&
    !edges.some(
      (edge) => edge.target === pipeline.id && edge.targetHandle === "input",
    ) &&
    !pipeline.data.pipelineValues?.input
  ) {
    issues.push(
      "Connect a samplesheet to the pipeline's input, or use the pipeline's test profile.",
    );
  }
  return issues;
};

/**
 * A Samplesheet node's CSV for a pipeline: mapped columns renamed to the
 * nf-core names (sample, fastq_1, fastq_2) and relative read paths pointing
 * into the input directory.
 */
export const samplesheetForPipeline = (node: Node<NodeData>): string => {
  const mapping = getSamplesheetMapping(node.data);
  const text =
    typeof node.data.samplesheet === "string" ? node.data.samplesheet : "";
  const [header, ...rows] = parseCsv(text);
  if (!header) return text;
  const renames = new Map<string, string>([
    [mapping.idColumn, DEFAULT_SAMPLESHEET_MAPPING.idColumn],
    [mapping.read1Column, DEFAULT_SAMPLESHEET_MAPPING.read1Column],
    ...(mapping.read2Column
      ? [
          [mapping.read2Column, DEFAULT_SAMPLESHEET_MAPPING.read2Column] as [
            string,
            string,
          ],
        ]
      : []),
  ]);
  const columns = header.fields.map((column) => column.trim());
  const readIndexes = new Set(
    [mapping.read1Column, mapping.read2Column]
      .filter(Boolean)
      .map((column) => columns.indexOf(column))
      .filter((index) => index >= 0),
  );
  const csvField = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = [
    columns.map((column) => csvField(renames.get(column) ?? column)).join(","),
    ...rows.map((row) =>
      row.fields
        .map((field, index) => {
          const value = field.trim();
          return csvField(
            readIndexes.has(index) && value ? inInputDir(value) : value,
          );
        })
        .join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
};

/** The value a connected input node gives a pipeline param. */
const connectedValue = (
  source: Node<NodeData>,
  sourceHandle: string | null | undefined,
): string | null => {
  if (source.type === "samplesheet") {
    return inInputDir(getSamplesheetFileName(source.data));
  }
  if (source.type === "parameters") {
    const parameter = getNodeParameters(source.data).find(
      (candidate) =>
        candidate.name === sourceHandle && candidate.type === "file",
    );
    return parameter?.value ? inInputDir(parameter.value) : null;
  }
  if (source.type === "fileInput") {
    const [file] = getNodeInputFiles(source);
    return file ? inInputDir(file.name) : null;
  }
  return null;
};

/**
 * The launch for a workflow with a Pipeline node, or null when it has none.
 * Throws with the launch issues when it can't run.
 */
export const buildPipelineLaunch = (
  nodes: Node<NodeData>[],
  edges: Edge[],
): PipelineLaunch | null => {
  const pipeline = nodes.find((node) => node.type === "pipeline");
  if (!pipeline) return null;
  const issues = getPipelineLaunchIssues(nodes, edges);
  if (issues.length > 0) throw new Error(issues.join(" "));

  const name = String(pipeline.data.pipelineName);
  const version = String(pipeline.data.pipelineVersion);
  const profiles = pipeline.data.pipelineTestProfile
    ? ["test", "docker"]
    : ["docker"];
  const values = (pipeline.data.pipelineValues ?? {}) as PipelineParamValues;
  const params: Record<string, PipelineParamValue> = {};
  for (const [param, value] of Object.entries(values)) {
    const trimmed = typeof value === "string" ? value.trim() : value;
    if (param === "outdir" || trimmed === "" || trimmed === undefined) continue;
    params[param] = trimmed;
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const inputFiles = new Map<string, WorkflowInputFile>();
  for (const node of nodes) {
    for (const file of getNodeInputFiles(node)) {
      if (!inputFiles.get(file.name)?.content) inputFiles.set(file.name, file);
    }
  }
  for (const edge of edges.filter(
    (candidate) => candidate.target === pipeline.id,
  )) {
    const source = nodesById.get(edge.source);
    const param = edge.targetHandle;
    if (!source || !param) continue;
    const value = connectedValue(source, edge.sourceHandle);
    if (value) params[param] = value;
    if (source.type === "samplesheet") {
      const fileName = getSamplesheetFileName(source.data);
      inputFiles.set(fileName, {
        name: fileName,
        content: samplesheetForPipeline(source),
      });
    }
  }

  return {
    nodeId: pipeline.id,
    name,
    version,
    profiles,
    params,
    inputFiles: Array.from(inputFiles.values()),
    command: [
      `nextflow run nf-core/${name}`,
      `-r ${version}`,
      `-profile ${profiles.join(",")}`,
      ...(Object.keys(params).length > 0 ? ["-params-file params.json"] : []),
      "--outdir results",
    ].join(" "),
  };
};

/** The params file of a launch. */
export const pipelineParamsFile = (launch: PipelineLaunch): string =>
  `${JSON.stringify(launch.params, null, 2)}\n`;

/**
 * A standalone shell script for a launch: writes the params file, then
 * runs the pipeline. Input files are expected in ./inputs.
 */
export const pipelineLaunchScript = (launch: PipelineLaunch): string =>
  [
    "#!/usr/bin/env bash",
    `# nf-core/${launch.name} ${launch.version}, generated by N-WAVE.`,
    ...(launch.inputFiles.length > 0
      ? [
          `# Inputs expected in ./${PIPELINE_INPUT_DIR}: ${launch.inputFiles.map((file) => file.name).join(", ")}`,
        ]
      : []),
    "set -euo pipefail",
    ...(Object.keys(launch.params).length > 0
      ? [
          "cat > params.json <<'NWAVE_PARAMS'",
          pipelineParamsFile(launch).trimEnd(),
          "NWAVE_PARAMS",
        ]
      : []),
    `${launch.command} "$@"`,
    "",
  ].join("\n");
