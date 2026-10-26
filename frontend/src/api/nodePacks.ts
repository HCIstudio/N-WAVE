// Node pack import and removal on top of the custom node store: imported
// nodes are saved like custom nodes (backend, or browser storage in the
// demo), after installing the nf-core components they include.

import api from "../api";
import type { StoredCustomNode } from "../registry/customNodes";
import {
  type InstalledNodePack,
  type NodePackNfCoreRefs,
  nfCoreInstallIds,
} from "../registry/nodePacks";
import { getApiErrorMessage } from "../utils/errors";
import { deleteCustomNode, persistCustomNode } from "./customNodes";
import type { InstalledNfCoreResponse } from "./nfcore";
import { installNfCoreModule, refreshInstalledNfCoreNodes } from "./nfcore";

/**
 * The community node pack index listed in the node library. Set
 * VITE_NODE_PACK_INDEX_URL at build time to use another one.
 */
export const NODE_PACK_INDEX_URL: string =
  import.meta.env.VITE_NODE_PACK_INDEX_URL ||
  "https://raw.githubusercontent.com/HCIstudio/N-WAVE-node-packs/main/index.json";

/** How long a node pack or index download may take. */
const FETCH_TIMEOUT_MS = 20_000;

/** A pack file (or index) from a URL. */
export const fetchNodePackText = async (url: string): Promise<string> => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Enter a full URL, starting with https://.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http and https URLs can be imported.");
  }
  // A stalled server mustn't keep the import buttons waiting forever.
  const response = await fetch(parsed.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`The server answered ${response.status} for ${url}.`);
  }
  return response.text();
};

/** nf-core components the nodes include that aren't installed yet. */
export const getMissingNfCoreComponents = async (
  refs: NodePackNfCoreRefs[],
): Promise<string[]> => {
  const wanted = Array.from(new Set(refs.flatMap(nfCoreInstallIds))).sort();
  if (wanted.length === 0) return [];
  const response = await api.get<InstalledNfCoreResponse>("/nfcore/installed");
  const installed = new Set(response.data.installed.map((entry) => entry.id));
  return wanted.filter((id) => !installed.has(id));
};

export interface NodePackImportResult {
  saved: StoredCustomNode[];
  installedComponents: string[];
  /** Nodes or components that failed, with the reason. */
  failures: string[];
  /** Stopped by `signal`: the rest wasn't installed or saved. */
  cancelled?: boolean;
}

export interface NodePackImportOptions {
  /** Stops the installs; what finished stays installed. */
  signal?: AbortSignal;
  /** Called before each component is installed. */
  onInstalling?: (id: string, position: number, count: number) => void;
}

/**
 * Install the missing nf-core components, then save the nodes. Keeps going
 * past failures and reports them.
 */
export const importPackNodes = async (
  nodes: StoredCustomNode[],
  missingComponents: string[],
  options: NodePackImportOptions = {},
): Promise<NodePackImportResult> => {
  const result: NodePackImportResult = {
    saved: [],
    installedComponents: [],
    failures: [],
  };
  // Subworkflows bring their own modules in, so install them first.
  const ordered = [...missingComponents].sort(
    (a, b) =>
      Number(!a.startsWith("nf-core/subworkflows/")) -
      Number(!b.startsWith("nf-core/subworkflows/")),
  );
  const brought = new Set<string>();
  for (const [position, id] of ordered.entries()) {
    if (brought.has(id)) continue;
    if (options.signal?.aborted) {
      result.cancelled = true;
      break;
    }
    options.onInstalling?.(id, position + 1, ordered.length);
    try {
      const { dependencies } = await installNfCoreModule(id, options.signal);
      result.installedComponents.push(id);
      for (const dependency of dependencies) brought.add(dependency);
    } catch (error) {
      if (options.signal?.aborted) {
        result.cancelled = true;
        break;
      }
      result.failures.push(
        `${id}: ${getApiErrorMessage(error, "could not be installed")}`,
      );
    }
  }
  if (result.installedComponents.length > 0) {
    await refreshInstalledNfCoreNodes().catch(() => 0);
  }
  if (result.cancelled) return result;
  for (const node of nodes) {
    try {
      result.saved.push(await persistCustomNode(node));
    } catch (error) {
      result.failures.push(
        `${node.label}: ${getApiErrorMessage(error, "could not be saved")}`,
      );
    }
  }
  return result;
};

/** Remove every node of an installed pack. */
export const removeNodePack = async (
  pack: InstalledNodePack,
): Promise<void> => {
  for (const node of pack.nodes) {
    await deleteCustomNode(node.id);
  }
};
