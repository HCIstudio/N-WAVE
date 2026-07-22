import api from "../api";
import {
  createNodeDefinitionFromNfCoreManifest,
  type NfCoreAdapterManifest,
} from "../registry/nfcoreModuleAdapters";
import {
  clearDynamicNodeDefinitions,
  registerDynamicNodeDefinitions,
} from "../registry/nodeDefinitions";

interface InstalledNfCoreModule {
  id: string;
  manifest?: NfCoreAdapterManifest;
}

interface InstalledNfCoreResponse {
  dataRoot?: string;
  installed: InstalledNfCoreModule[];
}

export interface NfCoreCatalogModule {
  id: string;
  moduleName: string;
  modulePath: string;
  label: string;
  description: string;
  processName: string;
  keywords: string[];
  tools: string[];
  inputs: string[];
  inputDeclarations?: string[];
  inputGroups?: Array<{
    argumentIndex: number;
    handle: string;
    tuple: boolean;
    metaName: string | null;
    fields: string[];
  }>;
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
  installedByDefault: boolean;
  support: "full" | "candidate" | "needs_review" | "unsupported";
  installed?: boolean;
  installability?: {
    automatic: boolean;
    requiresReview: boolean;
    reasons: string[];
  };
}

export interface NfCoreCatalogResponse {
  schemaVersion: number;
  generatedAt: string;
  counts: Record<string, number>;
  modules: NfCoreCatalogModule[];
}

export const refreshInstalledNfCoreNodes = async (): Promise<number> => {
  const response = await api.get<InstalledNfCoreResponse>("/nfcore/installed");
  const manifests = response.data.installed
    .map((entry) => entry.manifest)
    .filter((manifest): manifest is NfCoreAdapterManifest => Boolean(manifest));

  clearDynamicNodeDefinitions();
  registerDynamicNodeDefinitions(
    manifests.map((manifest) => createNodeDefinitionFromNfCoreManifest(manifest))
  );

  return manifests.length;
};

export const getNfCoreCatalog = async (): Promise<NfCoreCatalogResponse> => {
  const response = await api.get<NfCoreCatalogResponse>("/nfcore/catalog");
  return response.data;
};

export const installNfCoreModule = async (
  id: string
): Promise<NfCoreAdapterManifest> => {
  const response = await api.post<{
    manifest: NfCoreAdapterManifest;
  }>("/nfcore/install", { id });

  return response.data.manifest;
};
