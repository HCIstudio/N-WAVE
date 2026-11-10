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
import { usesImportedSource } from "./runRequest";
import { logActivity } from "../../activity/activityLog";
import { serializeDawModel, toDawModel } from "../../metamodel/toDawModel";

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
  /**
   * An imported .nf workflow's own source, used as is while it has no nodes
   * or still has processes N-WAVE only shows (see usesImportedSource).
   */
  rawSource: string | null;
  sourceFormat: "visual" | "nextflow";
}

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
  if (usesImportedSource(source)) {
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
  logActivity("workflow.exported", { kind: "script" });
};

/** Copy the same script to the clipboard. */
export const copyScript = async (source: WorkflowSource): Promise<void> => {
  await navigator.clipboard.writeText(scriptDownload(source).content);
  logActivity("workflow.exported", { kind: "script-copy" });
};

/**
 * Download the workflow as a DAW model: an instance of the consolidated
 * metamodel of workflow languages, as JSON (metamodel/dawModel.ts).
 */
export const downloadDawModel = (source: WorkflowSource, description?: string): string => {
  const fileName = `${fileBaseName(source.workflowName)}.daw.json`;
  const model = toDawModel({
    nodes: source.nodes,
    edges: source.edges,
    workflowName: source.workflowName || "Workflow",
    description,
    settings: source.settings as unknown as Record<string, unknown>,
  });
  downloadBlob(new Blob([serializeDawModel(model)], { type: "application/json;charset=utf-8" }), fileName);
  logActivity("workflow.exported", { kind: "daw-model" });
  return fileName;
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
    logActivity("workflow.exported", { kind: "project" });
    return fileName;
  }
  const script = usesImportedSource(source)
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
  logActivity("workflow.exported", { kind: "project" });
  return fileName;
};
