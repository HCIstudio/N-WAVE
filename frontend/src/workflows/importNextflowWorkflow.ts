// Imports a Nextflow script as a workflow: the canvas is built from the
// script (see import/importScript.ts), and the original source is kept with
// the workflow for reference.
//
// Import runs entirely in the browser: the draft is then saved through the
// normal "create workflow" path (POST /workflows in a real deployment, or the
// in-browser store in the demo). The backend has no import endpoint: the
// frontend owns all graph logic (generation and import), the backend owns
// persistence and execution.

import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";
import { getNfCoreCatalog } from "../api/nfcore";
import { registerDynamicNodeDefinitions } from "../registry/nodeDefinitions";
import type { ExecutionSettings } from "../types/execution";
import { defaultExecutionSettings } from "./defaultExecutionSettings";
import { importNextflowScript, type NfCoreCatalogForImport } from "./import/importScript";

interface ImportNextflowWorkflowInput {
  name?: string;
  description?: string;
  rawSource: string;
  sourceKey?: string | null;
  /** The nf-core catalog; loaded when the script includes nf-core components and none is given. */
  catalog?: NfCoreCatalogForImport | null;
}

export interface ImportedWorkflowDraft {
  name: string;
  description: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  executionSettings: ExecutionSettings;
  originType: "imported";
  sourceFormat: "nextflow";
  sourceKey: string | null;
  rawSource: string;
  importWarnings: string[];
  isBuiltin: false;
  isReadOnly: false;
}

/** The script's workflow name: its N-WAVE header, else its first named workflow or process. */
const inferWorkflowName = (rawSource: string): string | null =>
  rawSource.match(/^\s*\/\/\s*(.+)\n\/\/ Written by N-WAVE/)?.[1]?.trim() ??
  rawSource.match(/\bworkflow\s+([A-Za-z0-9_]+)\s*\{/)?.[1] ??
  rawSource.match(/\bprocess\s+([A-Za-z0-9_]+)\s*\{/)?.[1] ??
  null;

const usesNfCore = (source: string): boolean => /\b(modules|subworkflows)\/nf-core\//.test(source);

export const importNextflowWorkflow = async ({
  name,
  description,
  rawSource,
  sourceKey,
  catalog,
}: ImportNextflowWorkflowInput): Promise<ImportedWorkflowDraft> => {
  const normalizedSource = rawSource.trim();
  if (!normalizedSource) {
    throw new Error("Nextflow source is required for import.");
  }

  let nfCoreCatalog = catalog ?? null;
  const warnings: string[] = [];
  if (!nfCoreCatalog && usesNfCore(normalizedSource)) {
    try {
      nfCoreCatalog = await getNfCoreCatalog();
    } catch {
      warnings.push("The nf-core catalog couldn't be loaded, so nf-core modules in the script aren't recognized.");
    }
  }

  const imported = importNextflowScript(normalizedSource, { catalog: nfCoreCatalog });
  // The nf-core components the canvas uses, so it can show and generate them
  // (the workflow page asks to install those that aren't).
  registerDynamicNodeDefinitions(imported.definitions);

  if (imported.nodes.length === 0) {
    warnings.push("No Nextflow process blocks were found to visualize.");
  }

  return {
    name: name?.trim() || imported.name || inferWorkflowName(normalizedSource) || "Imported Nextflow Workflow",
    description:
      description?.trim() ||
      "Imported from a Nextflow script: each process, module and channel step is a node.",
    nodes: imported.nodes,
    edges: imported.edges,
    executionSettings: defaultExecutionSettings,
    originType: "imported",
    sourceFormat: "nextflow",
    sourceKey: sourceKey?.trim() || null,
    rawSource: normalizedSource,
    importWarnings: [...warnings, ...imported.warnings],
    isBuiltin: false,
    isReadOnly: false,
  };
};
