// Downloading the workflow as a script and exporting it as a runnable
// project.

import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../../components/nodes/BaseNode";
import { generateNextflowScript } from "../../generators";
import {
  buildPipelineLaunch,
  pipelineLaunchScript,
} from "../../registry/pipelines/launch";
import type { ExecutionSettings } from "../../types/execution";

/** Save a blob as a file download. */
export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export interface WorkflowSource {
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflowName: string;
  settings: ExecutionSettings;
  /** An imported .nf workflow's own source, used as is while it has no nodes. */
  rawSource: string | null;
  sourceFormat: "visual" | "nextflow";
}

const usesRawSource = ({ sourceFormat, rawSource, nodes }: WorkflowSource) =>
  sourceFormat === "nextflow" && Boolean(rawSource) && nodes.length === 0;

const fileBaseName = (workflowName: string) =>
  workflowName.replace(/\s+/g, "_") || "workflow";

const textBlob = (text: string) =>
  new Blob([text], { type: "text/plain;charset=utf-8" });

/**
 * The file "Download" saves: a Pipeline node's launch script, an imported
 * workflow's own source, or the generated Nextflow script. Throws when the
 * script can't be generated (e.g. a cycle).
 */
export const scriptDownload = (
  source: WorkflowSource,
): { fileName: string; content: string } => {
  const base = fileBaseName(source.workflowName);
  const launch = buildPipelineLaunch(source.nodes, source.edges);
  if (launch) {
    return { fileName: `${base}.sh`, content: pipelineLaunchScript(launch) };
  }
  if (usesRawSource(source)) {
    return { fileName: `${base}.nf`, content: source.rawSource ?? "" };
  }
  return {
    fileName: `${base}.nf`,
    content: generateNextflowScript(
      source.nodes,
      source.edges,
      source.workflowName || "workflow",
      source.settings?.output?.directory || "results",
      source.settings?.output?.namingPattern ?? "{workflow_name}_{timestamp}",
    ),
  };
};

export const downloadScript = (source: WorkflowSource) => {
  const { fileName, content } = scriptDownload(source);
  downloadBlob(textBlob(content), fileName);
};

/** Download the workflow as a zipped, runnable project; returns its file name. */
export const exportProject = async (source: WorkflowSource): Promise<string> => {
  const name = source.workflowName || "workflow";
  const nextflowVersion = source.settings?.nextflow?.version;
  const profiles = source.settings?.runProfiles ?? [];
  const launch = buildPipelineLaunch(source.nodes, source.edges);
  if (launch) {
    const { buildPipelineProjectFiles, toProjectName, zipProject } =
      await import("../../export/exportProject");
    const fileName = `${toProjectName(name)}.zip`;
    downloadBlob(
      await zipProject(
        name,
        buildPipelineProjectFiles({ workflowName: name, launch, nextflowVersion, profiles }),
      ),
      fileName,
    );
    return fileName;
  }
  const script = usesRawSource(source)
    ? (source.rawSource ?? "")
    : generateNextflowScript(
        source.nodes,
        source.edges,
        name,
        "results",
        source.settings?.output?.namingPattern ?? "{workflow_name}_{timestamp}",
      );
  const { exportWorkflowProject } = await import("../../export/exportWorkflow");
  const { fileName, blob } = await exportWorkflowProject({
    workflowName: name,
    script,
    nodes: source.nodes,
    nextflowVersion,
    profiles,
  });
  downloadBlob(blob, fileName);
  return fileName;
};
