import api from "../api";
import type {
  NfCoreModuleInputGroup,
  NfCoreValueInput,
} from "../registry/nfcore/inputChannels";
import {
  createNodeDefinitionFromNfCoreSubworkflowManifest,
  type NfCoreSubworkflowCatalogEntry,
} from "../registry/nfcore/subworkflow";
import {
  createNodeDefinitionFromNfCoreManifest,
  type NfCoreAdapterManifest,
} from "../registry/nfcoreModuleAdapters";
import {
  registerDynamicNodeDefinitions,
  unregisterDynamicNodeDefinitions,
} from "../registry/nodeDefinitions";

export interface InstalledNfCoreModule {
  id: string;
  installedAt?: string;
  sourceCommit?: string;
  support?: NfCoreCatalogModule["support"];
  manifest?: NfCoreAdapterManifest;
}

export interface InstalledNfCoreResponse {
  dataRoot?: string;
  installed: InstalledNfCoreModule[];
}

export interface NfCoreCatalogModule {
  id: string;
  source: {
    repository: string;
    ref: string;
    commit: string;
    path: string;
  };
  moduleName: string;
  modulePath: string;
  label: string;
  description: string;
  processName: string;
  files?: {
    /** Every file of the module except tests/, relative to its directory. */
    paths?: string[];
  };
  keywords: string[];
  tools: string[];
  inputs: string[];
  inputDeclarations?: string[];
  inputGroups?: NfCoreModuleInputGroup[];
  valueInputs?: NfCoreValueInput[];
  outputs: string[];
  emits: string[];
  settings?: {
    extArgs: boolean;
    extArgNames?: string[];
    argumentReferences?: Array<{
      type: string;
      url: string;
    }>;
    resources: boolean;
  };
  support: "full" | "candidate" | "needs_review" | "unsupported";
  installed?: boolean;
  installability?: {
    automatic: boolean;
    requiresReview: boolean;
    reasons: string[];
  };
}

/** An nf-core subworkflow in the catalog (schema 3+). */
export interface NfCoreCatalogSubworkflow extends NfCoreSubworkflowCatalogEntry {
  kind: "subworkflow";
  source: NfCoreCatalogModule["source"];
  files?: { paths?: string[] };
  keywords: string[];
  installed?: boolean;
}

export interface NfCoreCatalogResponse {
  schemaVersion: number;
  generatedAt: string;
  source?: { repository: string; ref: string; commit: string };
  counts: Record<string, number>;
  modules: NfCoreCatalogModule[];
  subworkflows?: NfCoreCatalogSubworkflow[];
}

export const refreshInstalledNfCoreNodes = async (): Promise<number> => {
  const response = await api.get<InstalledNfCoreResponse>("/nfcore/installed");
  const manifests = response.data.installed
    .map((entry) => entry.manifest)
    .filter((manifest): manifest is NfCoreAdapterManifest => Boolean(manifest));

  syncNfCoreNodeDefinitions(manifests);
  return manifests.length;
};

// Ids of the installed nf-core definitions in the registry, so a refresh
// replaces only those and leaves custom nodes registered.
const registeredNfCoreIds = new Set<string>();

const syncNfCoreNodeDefinitions = (manifests: NfCoreAdapterManifest[]) => {
  unregisterDynamicNodeDefinitions(Array.from(registeredNfCoreIds));
  registeredNfCoreIds.clear();
  const definitions = manifests.map((manifest) =>
    manifest.kind === "subworkflow"
      ? createNodeDefinitionFromNfCoreSubworkflowManifest(manifest)
      : createNodeDefinitionFromNfCoreManifest(manifest)
  );
  for (const definition of definitions) {
    registeredNfCoreIds.add(definition.id);
  }
  registerDynamicNodeDefinitions(definitions);
};

export const getNfCoreCatalog = async (): Promise<NfCoreCatalogResponse> => {
  const response = await api.get<NfCoreCatalogResponse>("/nfcore/catalog");
  return response.data;
};

/**
 * Install a module or subworkflow. `dependencies` lists the modules and
 * subworkflows a subworkflow brought in.
 */
export const installNfCoreModule = async (
  id: string
): Promise<{ manifest: NfCoreAdapterManifest; dependencies: string[] }> => {
  const response = await api.post<{
    manifest: NfCoreAdapterManifest;
    dependencies?: string[];
  }>("/nfcore/install", { id });

  return {
    manifest: response.data.manifest,
    dependencies: response.data.dependencies ?? [],
  };
};

/**
 * `main.nf` of an nf-core module or subworkflow, e.g.
 * getNfCoreModuleSource("nf-core/fastqc").
 */
export const getNfCoreModuleSource = async (id: string): Promise<string> => {
  const response = await api.get<{ id: string; source: string }>(
    `/nfcore/modules/source?id=${encodeURIComponent(id)}`
  );
  return response.data.source;
};

/** Remove an installed module or subworkflow. */
export const uninstallNfCoreModule = async (id: string): Promise<void> => {
  await api.post("/nfcore/uninstall", { id });
  await refreshInstalledNfCoreNodes();
};

/**
 * The files of an nf-core module or subworkflow (main.nf, meta.yml, ...),
 * keyed by name.
 */
export const getNfCoreModuleFiles = async (
  id: string
): Promise<Record<string, string>> => {
  const response = await api.get<{ id: string; files: Record<string, string> }>(
    `/nfcore/modules/files?id=${encodeURIComponent(id)}`
  );
  return response.data.files;
};
