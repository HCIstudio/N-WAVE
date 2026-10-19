import type { Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";
import catalog from "../registry/nfcore/catalog.json";
import {
  buildNfCoreManifest,
  type NfCoreCatalogEntryForManifest,
} from "../registry/nfcore/manifest";
import { createNodeDefinitionFromNfCoreManifest } from "../registry/nfcoreModuleAdapters";
import {
  getNodeDefinitionById,
  registerDynamicNodeDefinitions,
} from "../registry/nodeDefinitions";

/** A canvas node created the way the "Add node" menu creates it. */
export const makeNode = (
  definitionId: string,
  extra: Partial<NodeData> = {},
): Node<NodeData> => {
  const definition = getNodeDefinitionById(definitionId);
  if (!definition) throw new Error(`No node definition ${definitionId}`);
  return {
    id: `node-${definitionId}`,
    type: definition.type,
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      icon: definition.icon,
      ...definition.defaults,
      ...extra,
    },
  };
};

/**
 * Install an nf-core module from the bundled catalog, as the nf-core Library
 * does; returns its node definition's id (e.g. "nfcore_fastqc").
 */
export const installNfCoreModule = (moduleId: string): string => {
  const entry = (catalog as { modules: NfCoreCatalogEntryForManifest[] }).modules.find(
    (candidate) => candidate.id === moduleId,
  );
  if (!entry) throw new Error(`${moduleId} is not in the nf-core catalog`);
  const definition = createNodeDefinitionFromNfCoreManifest(buildNfCoreManifest(entry));
  registerDynamicNodeDefinitions([definition]);
  return definition.id;
};
