// Imports a DAW model (metamodel/dawModel.ts) as a workflow: N-WAVE's own
// models give their canvas back, others open as a skeleton to fill in.
// Like a Nextflow import, it runs in the browser and is saved through the
// normal "create workflow" path.

import type { Edge, Node } from "@xyflow/react";
import { getNfCoreCatalog } from "../api/nfcore";
import type { NodeData } from "../components/nodes/BaseNode";
import { readDawModel } from "../metamodel/dawModel";
import { type DawCatalog, fromDawModel } from "../metamodel/fromDawModel";
import { buildNfCoreManifest, type NfCoreCatalogEntryForManifest } from "../registry/nfcore/manifest";
import {
  buildNfCoreSubworkflowManifest,
  createNodeDefinitionFromNfCoreSubworkflowManifest,
  isNfCoreSubworkflowId,
  type NfCoreSubworkflowCatalogEntry,
} from "../registry/nfcore/subworkflow";
import { createNodeDefinitionFromNfCoreManifest } from "../registry/nfcoreModuleAdapters";
import { type NodeDefinition, registerDynamicNodeDefinitions } from "../registry/nodeDefinitions";
import type { ExecutionSettings } from "../types/execution";
import { DEFAULT_EXECUTION_SETTINGS } from "../pages/workflow/executionSettings";

export interface ImportedDawWorkflowDraft {
  name: string;
  description: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  executionSettings: ExecutionSettings;
  originType: "imported";
  sourceFormat: "visual";
  sourceKey: string | null;
  rawSource: null;
  importWarnings: string[];
  isBuiltin: false;
  isReadOnly: false;
}

/** The nf-core nodes the canvas uses, from the catalog, so it can show and generate them. */
const nfCoreDefinitions = (nodes: Node<NodeData>[], catalog: DawCatalog): NodeDefinition[] => {
  const ids = new Set(nodes.map((node) => node.data.nwaveNfCoreModuleId).filter((id): id is string => typeof id === "string"));
  return [...ids].flatMap((id) => {
    if (isNfCoreSubworkflowId(id)) {
      const entry = catalog.subworkflows?.find((candidate: NfCoreSubworkflowCatalogEntry) => candidate.id === id);
      return entry ? [createNodeDefinitionFromNfCoreSubworkflowManifest(buildNfCoreSubworkflowManifest(entry))] : [];
    }
    const entry = catalog.modules?.find((candidate: NfCoreCatalogEntryForManifest) => candidate.id === id);
    return entry ? [createNodeDefinitionFromNfCoreManifest(buildNfCoreManifest(entry))] : [];
  });
};

export const importDawWorkflow = async ({
  name,
  description,
  source,
  sourceKey,
  catalog,
}: {
  name?: string;
  description?: string;
  source: string;
  sourceKey?: string | null;
  /** The nf-core catalog; loaded when the model refers to nf-core and none is given. */
  catalog?: DawCatalog | null;
}): Promise<ImportedDawWorkflowDraft> => {
  const { model, warnings } = readDawModel(source);
  let nfCoreCatalog = catalog ?? null;
  if (!nfCoreCatalog && /nf-core\//.test(source)) {
    try {
      nfCoreCatalog = (await getNfCoreCatalog()) as unknown as DawCatalog;
    } catch {
      warnings.push("The nf-core catalog couldn't be loaded, so nf-core modules in the model aren't recognized.");
    }
  }
  const canvas = fromDawModel(model, nfCoreCatalog);
  registerDynamicNodeDefinitions([...canvas.definitions, ...(nfCoreCatalog ? nfCoreDefinitions(canvas.nodes, nfCoreCatalog) : [])]);
  if (canvas.nodes.length === 0) warnings.push("The model has no tasks or storages to show.");
  return {
    name: name?.trim() || canvas.name || "Imported DAW model",
    description: description?.trim() || canvas.description || "Imported from a DAW model.",
    nodes: canvas.nodes,
    edges: canvas.edges,
    // The model's settings over the defaults, so a setting it doesn't have is still set.
    executionSettings: { ...DEFAULT_EXECUTION_SETTINGS, ...(canvas.executionSettings ?? {}) } as ExecutionSettings,
    originType: "imported",
    sourceFormat: "visual",
    sourceKey: sourceKey?.trim() || null,
    rawSource: null,
    importWarnings: [...warnings, ...canvas.warnings],
    isBuiltin: false,
    isReadOnly: false,
  };
};
