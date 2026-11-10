// "Copy into new workflow" for an nf-core subworkflow: the draft of a new,
// editable workflow with the subworkflow's steps (see import/copySubworkflow.ts).
// It is saved through the normal "create workflow" path, like an import.

import { createContext, useContext } from "react";
import { getNfCoreCatalog, getNfCoreModuleSource } from "../api/nfcore";
import { registerDynamicNodeDefinitions } from "../registry/nodeDefinitions";
import { copySubworkflow } from "./import/copySubworkflow";
import type { NfCoreCatalogForImport } from "./import/importScript";
import type { ImportedWorkflowDraft } from "./importNextflowWorkflow";
import { DEFAULT_EXECUTION_SETTINGS } from "../pages/workflow/executionSettings";

export const buildSubworkflowCopy = async (id: string): Promise<ImportedWorkflowDraft> => {
  const [catalog, source] = await Promise.all([getNfCoreCatalog(), getNfCoreModuleSource(id)]);
  const forImport = catalog as unknown as NfCoreCatalogForImport;
  const entry = forImport.subworkflows?.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`${id} isn't in the nf-core catalog.`);
  const copy = copySubworkflow(source, entry, forImport);
  // The nf-core steps it uses, so the canvas can show and generate them.
  registerDynamicNodeDefinitions(copy.definitions);
  return {
    name: copy.name,
    description: `The steps of the nf-core subworkflow ${id.replace(/^nf-core\/subworkflows\//, "")}, to change as you like.`,
    nodes: copy.nodes,
    edges: copy.edges,
    executionSettings: DEFAULT_EXECUTION_SETTINGS,
    originType: "imported",
    sourceFormat: "nextflow",
    sourceKey: id,
    rawSource: source,
    importWarnings: copy.warnings,
    isBuiltin: false,
    isReadOnly: false,
  };
};

/** Copies a subworkflow (by its nf-core id) into a new workflow and opens it; null where that isn't offered. */
export const CopySubworkflowContext = createContext<((id: string) => Promise<void>) | null>(null);

export const useCopySubworkflow = () => useContext(CopySubworkflowContext);
