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
import type { BioflowResult } from "../../analysis/bioflow";
import { graphModel } from "../../analysis/graphViews";
import {
  canvasDiagram,
  DIAGRAM_FORMATS,
  type Diagram,
  type DiagramFormat,
  graphDiagram,
  renderDiagram,
} from "../../export/diagrams";

import { downloadBlob } from "../../utils/download";

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
    errorStrategy: source.settings?.errorHandling?.strategy,
  });
  downloadBlob(blob, fileName);
  logActivity("workflow.exported", { kind: "project" });
  return fileName;
};

/** What a diagram shows: the editor's canvas, or a graph view of the code (as the view switch names them). */
export type DiagramSource = "editor" | "specification" | "dependencies";

/** The diagrams there are: the editor, and with a current analysis the two graph views. */
export const diagramSources = (bioflow: BioflowResult | null): Array<{ id: DiagramSource; label: string }> => [
  { id: "editor", label: "Editor: the canvas as drawn" },
  ...(bioflow?.specification
    ? [{ id: "specification" as const, label: "Specification graph: every process, operation and channel" }]
    : []),
  ...(bioflow ? [{ id: "dependencies" as const, label: "Process dependency graph: which process depends on which" }] : []),
];

const diagramOf = (source: WorkflowSource, which: DiagramSource, bioflow: BioflowResult | null): Diagram | null => {
  if (which === "editor") return canvasDiagram(source.nodes, source.edges);
  const model = bioflow ? graphModel(bioflow, which) : null;
  return model ? graphDiagram(model) : null;
};

/** Download a diagram; returns its file name. */
export const downloadDiagram = async (
  source: WorkflowSource,
  which: DiagramSource,
  format: DiagramFormat,
  bioflow: BioflowResult | null,
): Promise<string> => {
  const diagram = diagramOf(source, which, bioflow);
  if (!diagram) throw new Error("There is no analysis of this workflow to draw. Analyse it first.");
  const extension = DIAGRAM_FORMATS.find((entry) => entry.format === format)?.extension ?? "";
  const fileName = `${fileBaseName(source.workflowName)}${which === "editor" ? "" : `.${which}`}${extension}`;
  downloadBlob(await renderDiagram(diagram, format, source.workflowName || "workflow"), fileName);
  logActivity("workflow.exported", { kind: "diagram", source: which, format });
  return fileName;
};
